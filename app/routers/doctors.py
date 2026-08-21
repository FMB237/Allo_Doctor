from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app import models, schemas
from app.auth_utils import get_current_user

router = APIRouter()

@router.get("/doctor/profile")
async def get_doctor_profile(
    current_user: models.User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != models.UserRole.DOCTOR.value:
        raise HTTPException(status_code=403, detail="Only doctors can access this")
    
    result = await db.execute(
        select(models.DoctorProfile).where(models.DoctorProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    
    return {
        "specialization": profile.specialization,
        "bio": profile.bio,
        "experience_years": profile.experience_years,
        "consultation_fee": profile.consultation_fee
    }

@router.put("/doctor/profile", status_code=200)
async def update_doctor_profile(
    update_data: schemas.DoctorProfileUpdate, 
    current_user: models.User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != models.UserRole.DOCTOR.value:
        raise HTTPException(status_code=403, detail="Only doctors can update a doctor profile")
    
    result = await db.execute(
        select(models.DoctorProfile).where(models.DoctorProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(profile, key, value)
        
    await db.commit()
    await db.refresh(profile)
    return {
        "message": "Profile updated successfully", 
        "profile": {
            "specialization": profile.specialization, 
            "bio": profile.bio, 
            "experience_years": profile.experience_years, 
            "consultation_fee": profile.consultation_fee
        }
    }

@router.get("/doctors")
async def list_doctors(specialization: str = None, db: AsyncSession = Depends(get_db)):
    query = select(models.DoctorProfile).options(joinedload(models.DoctorProfile.user))
    if specialization:
        query = query.where(models.DoctorProfile.specialization.ilike(f"%{specialization}%"))
    
    result = await db.execute(query)
    profiles = result.scalars().all()
    return [
        {
            "id": p.user_id, 
            "name": p.user.full_name, 
            "specialization": p.specialization, 
            "experience": p.experience_years, 
            "fee": p.consultation_fee, 
            "bio": p.bio
        } 
        for p in profiles
    ]
