import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import get_settings

settings = get_settings()

async def send_email(to_email: str, subject: str, html_body: str):
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[EMAIL MOCK] To: {to_email} | Subject: {subject}")
        print(html_body[:200])
        return True
    
    message = MIMEMultipart("alternative")
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html_body, "html"))
    
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
        )
        print(f"✅ Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"❌ Email failed: {e}")
        return False

def appointment_reminder_template(patient_name: str, doctor_name: str, appointment_time: str, doctor_specialization: str):
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Rappel de rendez-vous - Allo Doctor</h2>
            <p>Bonjour <strong>{patient_name}</strong>,</p>
            <p>Ceci est un rappel pour votre consultation avec <strong>Dr. {doctor_name}</strong> ({doctor_specialization}).</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Date et heure:</strong> {appointment_time}</p>
            </div>
            <p>Merci de vous présenter 10 minutes avant l'heure prévue.</p>
            <p>À bientôt,<br>L'équipe Allo Doctor</p>
        </div>
    </body>
    </html>
    """
