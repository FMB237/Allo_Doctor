from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app import models, schemas
from app.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        user_role = models.UserRole(user_data.role.lower())
    except (ValueError, TypeError):
        user_role = models.UserRole.PATIENT

    new_user = models.User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_role.value
    )
    db.add(new_user)
    await db.flush()

    if user_role == models.UserRole.DOCTOR:
        if not user_data.specialization:
            raise HTTPException(status_code=400, detail="Specialization is required for doctors")
        # Avoid duplicate profile if it already exists
        result = await db.execute(select(models.DoctorProfile).where(models.DoctorProfile.user_id == new_user.id))
        existing = result.scalar_one_or_none()
        if not existing:
            doctor_profile = models.DoctorProfile(
                user_id=new_user.id,
                specialization=user_data.specialization,
                bio="New doctor profile"
            )
            db.add(doctor_profile)

    await db.commit()
    await db.refresh(new_user)
    access_token = create_access_token(data={"sub": new_user.email, "role": new_user.role})
    return {"message": "User registered successfully", "user_id": new_user.id, "role": new_user.role, "access_token": access_token}

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"full_name": user.full_name, "role": user.role}
    }

@router.get("/me")
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role
    }
