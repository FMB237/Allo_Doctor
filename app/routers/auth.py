from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app import models, schemas
from app.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(response: Response, user_data: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
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
    response.set_cookie(key="access_token", value=access_token, httponly=True, samesite="lax", max_age=60*60*24)
    return {"message": "User registered successfully", "user_id": new_user.id, "role": new_user.role, "access_token": access_token}

@router.post("/login")
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    response.set_cookie(key="access_token", value=access_token, httponly=True, samesite="lax", max_age=60*60*24)
    return {
        "message": "Login successful",
        "access_token": access_token,
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

@router.post("/forgot-password/verify")
async def verify_email(payload: dict, db: AsyncSession = Depends(get_db)):
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"message": "Email verified"}

@router.post("/reset-password")
async def reset_password(payload: dict, db: AsyncSession = Depends(get_db)):
    email = payload.get("email")
    new_password = payload.get("new_password")
    if not email or not new_password:
        raise HTTPException(status_code=400, detail="Email and new password required")
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    user.hashed_password = hash_password(new_password)
    await db.commit()
    return {"message": "Password reset successful"}

@router.get("/redirect")
async def auth_redirect(current_user: models.User = Depends(get_current_user)):
    role = current_user.role
    if role == models.UserRole.ADMIN.value:
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    elif role == models.UserRole.DOCTOR.value:
        return RedirectResponse(url="/doctor/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    else:
        return RedirectResponse(url="/patient/dashboard", status_code=status.HTTP_303_SEE_OTHER)
