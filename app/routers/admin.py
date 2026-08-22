from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.database import get_db
from app import models
from app.auth_utils import require_admin, hash_password, is_strong_password
import csv, io, json

router = APIRouter(prefix="/api/admin", tags=["admin"])

async def log_audit(db: AsyncSession, admin_user_id: int, action: str, target_type: str, target_id: int | None = None, changes: dict | None = None, request: Request | None = None):
    ip = request.client.host if request else None
    ua = request.headers.get("user-agent") if request else None
    entry = models.AuditLog(
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        changes_json=json.dumps(changes) if changes else None,
        ip_address=ip,
        user_agent=ua
    )
    db.add(entry)
    await db.flush()

@router.get("/audit-logs")
async def list_audit_logs(db: AsyncSession = Depends(get_db), admin=Depends(require_admin), limit: int = 200):
    result = await db.execute(
        select(models.AuditLog)
        .options()
        .order_by(models.AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "admin_user_id": l.admin_user_id,
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "changes_json": l.changes_json,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None
        } for l in logs
    ]

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

@router.get("/users/export")
async def export_users_csv(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).order_by(models.User.created_at.desc()))
    users = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id","full_name","email","role","is_active","created_at"])
    for u in users:
        writer.writerow([u.id, u.full_name, u.email, u.role, u.is_active, u.created_at.isoformat() if u.created_at else ""])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition":"attachment; filename=users.csv"})

@router.post("/users")
async def create_user(payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    email = payload.get("email")
    full_name = payload.get("full_name")
    password = payload.get("password")
    role = payload.get("role", "patient")
    is_active = payload.get("is_active", True)
    if not email or not full_name or not password:
        raise HTTPException(status_code=400, detail="email, full_name and password required")
    if not is_strong_password(password):
        raise HTTPException(status_code=400, detail="Password too weak: min 8 chars with upper, lower and digit")
    result = await db.execute(select(models.User).where(models.User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        user_role = models.UserRole(role.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")
    new_user = models.User(
        full_name=full_name,
        email=email,
        hashed_password=hash_password(password),
        role=user_role.value,
        is_active=is_active
    )
    db.add(new_user)
    await db.flush()
    if user_role == models.UserRole.DOCTOR:
        specialization = payload.get("specialization")
        if not specialization:
            raise HTTPException(status_code=400, detail="Specialization required for doctors")
        doctor_profile = models.DoctorProfile(
            user_id=new_user.id,
            specialization=specialization,
            bio=payload.get("bio", ""),
            experience_years=payload.get("experience_years"),
            consultation_fee=payload.get("consultation_fee")
        )
        db.add(doctor_profile)
    await log_audit(db, admin.id, "user_created", "User", new_user.id, {"email": email, "role": user_role.value})
    await db.commit()
    await db.refresh(new_user)
    return {"message": "User created", "user_id": new_user.id, "role": new_user.role}

@router.post("/users/bulk")
async def bulk_create_users(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="CSV file required")
    content = await file.read()
    text = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    errors = []
    for i, row in enumerate(reader, start=2):
        try:
            email = (row.get('email') or '').strip()
            full_name = (row.get('full_name') or '').strip()
            password = (row.get('password') or '').strip()
            role = (row.get('role') or 'patient').strip().lower()
            is_active = str(row.get('is_active','true')).strip().lower() in ('true','1','yes')
            if not email or not full_name or not password:
                errors.append(f"Ligne {i}: email, full_name et password requis")
                continue
            if not is_strong_password(password):
                errors.append(f"Ligne {i}: password trop faible, min 8 caractères avec majuscule, minuscule et chiffre")
                continue
            result = await db.execute(select(models.User).where(models.User.email == email))
            if result.scalar_one_or_none():
                errors.append(f"Ligne {i}: email déjà existant")
                continue
            try:
                user_role = models.UserRole(role)
            except ValueError:
                errors.append(f"Ligne {i}: rôle invalide")
                continue
            new_user = models.User(
                full_name=full_name,
                email=email,
                hashed_password=hash_password(password),
                role=user_role.value,
                is_active=is_active
            )
            db.add(new_user)
            await db.flush()
            if user_role == models.UserRole.DOCTOR:
                specialization = (row.get('specialization') or '').strip()
                if not specialization:
                    errors.append(f"Ligne {i}: spécialité requise pour docteur")
                    await db.rollback()
                    continue
                doctor_profile = models.DoctorProfile(
                    user_id=new_user.id,
                    specialization=specialization,
                    bio=row.get('bio',''),
                    experience_years=int(row.get('experience_years') or 0) or None,
                    consultation_fee=int(row.get('consultation_fee') or 0) or None
                )
                db.add(doctor_profile)
            await log_audit(db, admin.id, "user_bulk_created", "User", new_user.id, {"email": email, "role": user_role.value})
            created += 1
        except Exception as e:
            errors.append(f"Ligne {i}: {str(e)}")
    await db.commit()
    return {"created": created, "errors": errors}

@router.put("/users/{user_id}")
async def update_user(user_id: int, payload: dict, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {}
    if "full_name" in payload:
        changes["full_name"] = {"old": user.full_name, "new": payload["full_name"]}
        user.full_name = payload["full_name"]
    if "role" in payload:
        try:
            role = models.UserRole(payload["role"].lower())
            changes["role"] = {"old": user.role, "new": role.value}
            user.role = role.value
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid role")
    if "is_active" in payload:
        changes["is_active"] = {"old": user.is_active, "new": bool(payload["is_active"])}
        user.is_active = bool(payload["is_active"])
    await log_audit(db, admin.id, "user_updated", "User", user.id, changes)
    await db.commit()
    return {"message": "User updated"}

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent deleting self
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await log_audit(db, admin.id, "user_deleted", "User", user.id, {"email": user.email, "role": user.role})
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
        .options(
            selectinload(models.Appointment.patient),
            selectinload(models.Appointment.doctor_profile).selectinload(models.DoctorProfile.user)
        )
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
    changes = {}
    if "status" in payload:
        changes["status"] = {"old": appt.status, "new": payload["status"]}
        appt.status = payload["status"]
    await log_audit(db, admin.id, "appointment_updated", "Appointment", appt.id, changes)
    await db.commit()
    return {"message": "Appointment updated"}
