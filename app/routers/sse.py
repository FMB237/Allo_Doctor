import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app import models
from app.auth_utils import decode_access_token
from app.sse_manager import sse_manager

router = APIRouter()

@router.get("/events/doctor")
async def doctor_events_stream(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(models.User).where(models.User.email == email))
    current_user = result.scalar_one_or_none()
    if not current_user:
        raise HTTPException(status_code=401, detail="User not found")
    if current_user.role != models.UserRole.DOCTOR.value:
        raise HTTPException(status_code=403, detail="Only doctors can access this stream")

    result = await db.execute(
        select(models.DoctorProfile).where(models.DoctorProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")

    doctor_id = profile.user_id
    queue = await sse_manager.subscribe(doctor_id)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'data': {'doctor_id': doctor_id}})}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield payload
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await sse_manager.unsubscribe(doctor_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
