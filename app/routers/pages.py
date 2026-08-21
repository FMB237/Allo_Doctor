from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name="index.html", 
        context={"message": "Allo Doctor: Classic Mode Active! 🩺"}
    )

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse(request=request, name="register.html")

@router.get("/register/success", response_class=HTMLResponse)
async def register_success(request: Request):
    return templates.TemplateResponse(request=request, name="register_success.html")

@router.get("/patient/dashboard", response_class=HTMLResponse)
async def patient_dashboard(request: Request):
    return templates.TemplateResponse(request=request, name="patient_dashboard.html")

@router.get("/doctor/dashboard", response_class=HTMLResponse)
async def doctor_dashboard(request: Request):
    return templates.TemplateResponse(request=request, name="doctor_dashboard.html", context={})

@router.get("/forgot-password", response_class=HTMLResponse)
async def forgot_password_page(request: Request):
    return templates.TemplateResponse(request=request, name="email_verification.html")

@router.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request):
    return templates.TemplateResponse(request=request, name="password_reset.html")
