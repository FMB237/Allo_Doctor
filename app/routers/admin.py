from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.database import get_db
from app import models
from app.auth_utils import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/stats")
async def admin_stats(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    total_users = await db.scalar(select(func.count(models.User.id)))
    total_doctors = await db.scalar(select(func.count(models.DoctorProfile.id)))
    total_appointments = await db.scalar(select(func.count(models.Appointment.id)))
    pending_appointments = await db.scalar(select(func.count(models.Appointment.id)).where(models.Appointment.status == "pending"))
    return {
        "total_users": total_users or 0,
        "total_doctors": total_doctors or 0,
        "total_appointments": total_appointments or 0,
        "pending_appointments": pending_appointments or 0
    }

@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).order_by(models.User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None
        } for u in users
    ]

@router.put("/users/{user_id}")
async def update_user(user_id: int, payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "full_name" in payload:
        user.full_name = payload["full_name"]
    if "role" in payload:
        try:
            role = models.UserRole(payload["role"].lower())
            user.role = role.value
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid role")
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    await db.commit()
    return {"message": "User updated"}

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent deleting self
    # Note: admin user id check could be added
    await db.delete(user)
    await db.commit()
    return {"message": "User deleted"}

@router.get("/doctors")
async def list_doctors(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(
        select(models.DoctorProfile)
        .options(selectinload(models.DoctorProfile.user))
        .order_by(models.DoctorProfile.id.desc())
    )
    profiles = result.scalars().all()
    return [
        {
            "id": p.id,
            "user_id": p.user_id,
            "user": {
                "id": p.user.id,
                "full_name": p.user.full_name,
                "email": p.user.email
            },
            "specialization": p.specialization,
            "bio": p.bio,
            "experience_years": p.experience_years,
            "consultation_fee": p.consultation_fee
        } for p in profiles
    ]

@router.get("/appointments")
async def list_appointments(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(
        select(models.Appointment)
        .options(selectinload(models.Appointment.patient), selectinload(models.Appointment.doctor_profile))
        .order_by(models.Appointment.appointment_time.desc())
    )
    appts = result.scalars().all()
    out = []
    for a in appts:
        doctor_name = a.doctor_profile.user.full_name if a.doctor_profile and a.doctor_profile.user else "N/A"
        out.append({
            "id": a.id,
            "patient_id": a.patient_id,
            "patient_name": a.patient.full_name if a.patient else "N/A",
            "doctor_id": a.doctor_id,
            "doctor_name": doctor_name,
            "appointment_time": a.appointment_time.isoformat(),
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None
        })
    return out

@router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: int, payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.Appointment).where(models.Appointment.id == appointment_id))
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if "status" in payload:
        appt.status = payload["status"]
    await db.commit()
    return {"message": "Appointment updated"}
