from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app import models
from app.services.email_service import send_email, appointment_reminder_template

async def check_and_send_reminders(db: AsyncSession):
    now = datetime.now()
    
    # Check for appointments in next 24 hours and 1 hour
    for hours_ahead in [24, 1]:
        target_time = now + timedelta(hours=hours_ahead)
        window_start = target_time - timedelta(minutes=30)
        window_end = target_time + timedelta(minutes=30)
        
        result = await db.execute(
            select(models.Appointment)
            .where(
                models.Appointment.appointment_time >= window_start,
                models.Appointment.appointment_time <= window_end,
                models.Appointment.status.in_(["pending", "confirmed"])
            )
            .join(models.User, models.Appointment.patient_id == models.User.id)
            .join(models.DoctorProfile, models.Appointment.doctor_id == models.DoctorProfile.user_id)
            .join(models.User, models.DoctorProfile.user_id == models.User.id)
        )
        appointments = result.scalars().all()
        
        for appt in appointments:
            # Check if reminder already sent
            if hasattr(appt, 'reminder_sent') and appt.reminder_sent:
                continue
                
            patient = await db.get(models.User, appt.patient_id)
            doctor_profile = await db.get(models.DoctorProfile, appt.doctor_id)
            doctor = await db.get(models.User, appt.doctor_id)
            
            if patient.email and doctor_profile:
                appointment_time_str = appt.appointment_time.strftime("%A %d %B %Y à %H:%M")
                html = appointment_reminder_template(
                    patient_name=patient.full_name,
                    doctor_name=doctor.full_name,
                    appointment_time=appointment_time_str,
                    doctor_specialization=doctor_profile.specialization
                )
                subject = f"Rappel: Rendez-vous dans {hours_ahead}h avec Dr. {doctor.full_name}"
                await send_email(patient.email, subject, html)
                
                # Mark as reminded (simple approach - in production use a separate table)
                print(f"Reminder sent for appointment {appt.id}")
