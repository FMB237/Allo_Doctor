from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from datetime import datetime, time, timedelta, date
from app.database import get_db
from app import models, schemas
from app.auth_utils import get_current_user
from app.sse_manager import sse_manager

router = APIRouter()

@router.post("/appointments/book", status_code=201)
async def book_appointment(
    appointment_data: schemas.AppointmentCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != models.UserRole.PATIENT.value:
        raise HTTPException(status_code=403, detail="Only patients can book appointments")

    appointment_time_naive = appointment_data.appointment_time.replace(tzinfo=None)
    if appointment_time_naive < datetime.now().replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past")

    # 1. Check Doctor Availability (Working Hours)
    day_of_week = appointment_time_naive.weekday()
    appt_date = appointment_time_naive.date()
    appt_time = appointment_time_naive.time()
    
    avail_result = await db.execute(
        select(models.DoctorAvailability).where(
            models.DoctorAvailability.doctor_user_id == appointment_data.doctor_id,
            models.DoctorAvailability.day_of_week == day_of_week,
            models.DoctorAvailability.is_available == True
        )
    )
    availabilities = avail_result.scalars().all()
    
    is_within_hours = False
    for slot in availabilities:
        # Check date range if defined
        if slot.start_date and appt_date < slot.start_date:
            continue
        if slot.end_date and appt_date > slot.end_date:
            continue
        start = time.fromisoformat(slot.start_time)
        end = time.fromisoformat(slot.end_time)
        if start <= appt_time <= end:
            is_within_hours = True
            break
    
    if not is_within_hours:
        raise HTTPException(
            status_code=400, 
            detail="Le médecin n'est pas disponible à cet horaire. Veuillez choisir un créneau dans ses heures de travail."
        )

    # 2. Check for conflicts (Double booking)
    conflict = await db.execute(select(models.Appointment).where(
        models.Appointment.doctor_id == appointment_data.doctor_id,
        models.Appointment.appointment_time == appointment_time_naive,
        models.Appointment.status != "cancelled"
    ))
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This time slot is already taken")

    new_appointment = models.Appointment(
        patient_id=current_user.id,
        doctor_id=appointment_data.doctor_id,
        appointment_time=appointment_time_naive
    )
    db.add(new_appointment)
    await db.commit()
    await db.refresh(new_appointment)

    patient_result = await db.execute(select(models.User).where(models.User.id == current_user.id))
    patient = patient_result.scalar_one_or_none()
    
    await sse_manager.broadcast(
        doctor_id=appointment_data.doctor_id,
        event_type="new_appointment",
        data={
            "appointment_id": new_appointment.id,
            "patient_name": patient.full_name if patient else "Patient",
            "appointment_time": appointment_time_naive.isoformat(),
            "status": "pending"
        }
    )
    return {"message": "Appointment booked successfully!", "appointment_id": new_appointment.id}

@router.get("/appointments/my-schedule")
async def get_doctor_schedule(
    current_user: models.User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != models.UserRole.DOCTOR.value:
        raise HTTPException(status_code=403, detail="Only doctors can access their schedule")
    
    profile_result = await db.execute(
        select(models.DoctorProfile).where(models.DoctorProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")

    query = (
        select(models.Appointment)
        .where(models.Appointment.doctor_id == profile.user_id)
        .options(joinedload(models.Appointment.patient))
        .order_by(models.Appointment.appointment_time)
    )
    result = await db.execute(query)
    appointments = result.scalars().all()
    return [
        {
            "id": appt.id, 
            "patient_name": appt.patient.full_name, 
            "appointment_time": appt.appointment_time.isoformat(), 
            "status": appt.status
        } 
        for appt in appointments
    ]

@router.patch("/appointments/{appointment_id}/status")
async def update_appointment_status(
    appointment_id: int,
    status_update: schemas.AppointmentStatusUpdate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(models.Appointment).where(models.Appointment.id == appointment_id)
    )
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    is_patient = (appointment.patient_id == current_user.id)
    profile_result = await db.execute(
        select(models.DoctorProfile).where(models.DoctorProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()
    is_doctor = (profile and appointment.doctor_id == profile.user_id)

    if not (is_patient or is_doctor):
        raise HTTPException(status_code=403, detail="You are not authorized to modify this appointment")
    if status_update.status in ["confirmed", "completed"] and not is_doctor:
        raise HTTPException(status_code=403, detail="Only doctors can confirm or complete appointments")

    appointment.status = status_update.status
    await db.commit()

    await sse_manager.broadcast(
        doctor_id=appointment.doctor_id,
        event_type="status_update",
        data={
            "appointment_id": appointment.id,
            "status": status_update.status,
            "updated_by": "doctor" if is_doctor else "patient"
        }
    )
    return {"message": f"Appointment status updated to {status_update.status}"}

@router.get("/appointments/my-appointments")
async def get_patient_appointments(
    current_user: models.User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != models.UserRole.PATIENT.value:
        raise HTTPException(status_code=403, detail="Only patients can access their own appointments")

    query = (
        select(models.Appointment)
        .where(models.Appointment.patient_id == current_user.id)
        .options(joinedload(models.Appointment.doctor_profile).joinedload(models.DoctorProfile.user))
        .order_by(models.Appointment.appointment_time)
    )
    result = await db.execute(query)
    appointments = result.scalars().all()
    return [
        {
            "id": appt.id, 
            "doctor_name": appt.doctor_profile.user.full_name, 
            "specialization": appt.doctor_profile.specialization, 
            "appointment_time": appt.appointment_time.isoformat(), 
            "status": appt.status
        } 
        for appt in appointments
    ]

@router.get("/appointments/doctor/{doctor_id}/available-slots")
async def get_available_slots(doctor_id: int, db: AsyncSession = Depends(get_db)):
    # Get doctor availability
    avail_result = await db.execute(
        select(models.DoctorAvailability).where(
            models.DoctorAvailability.doctor_user_id == doctor_id,
            models.DoctorAvailability.is_available == True
        ).order_by(models.DoctorAvailability.day_of_week, models.DoctorAvailability.start_time)
    )
    availabilities = avail_result.scalars().all()
    
    if not availabilities:
        return []
    
    # Get existing appointments for next 14 days
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = today + timedelta(days=14)
    
    appt_result = await db.execute(
        select(models.Appointment).where(
            models.Appointment.doctor_id == doctor_id,
            models.Appointment.appointment_time >= today,
            models.Appointment.appointment_time <= end_date,
            models.Appointment.status != "cancelled"
        )
    )
    existing_appts = appt_result.scalars().all()
    booked_times = {appt.appointment_time for appt in existing_appts}
    
    # Build slots
    slots_by_date = {}
    for i in range(14):
        date = today + timedelta(days=i)
        day_of_week = date.weekday()
        
        day_slots = [a for a in availabilities if a.day_of_week == day_of_week]
        if not day_slots:
            continue
        
        # Filter by date range
        valid_slots = []
        for slot in day_slots:
            if slot.start_date and date.date() < slot.start_date:
                continue
            if slot.end_date and date.date() > slot.end_date:
                continue
            valid_slots.append(slot)
        
        if not valid_slots:
            continue
        
        date_slots = []
        for slot in valid_slots:
            start = datetime.combine(date.date(), time.fromisoformat(slot.start_time))
            end = datetime.combine(date.date(), time.fromisoformat(slot.end_time))
            # Generate 30-min slots
            current = start
            while current < end:
                if current not in booked_times and current >= datetime.now():
                    date_slots.append(current.isoformat())
                current += timedelta(minutes=30)
        
        if date_slots:
            slots_by_date[date.date().isoformat()] = date_slots
    
    return slots_by_date
