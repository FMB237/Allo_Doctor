import asyncio
from app.database import AsyncSessionLocal
from app import models
from app.auth_utils import hash_password

async def create_admin(email, password, full_name="Admin User"):
    async with AsyncSessionLocal() as session:
        # Check if exists
        from sqlalchemy import select
        result = await session.execute(select(models.User).where(models.User.email == email))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"User {email} already exists with role {existing.role}")
            # Promote to admin if not already
            if existing.role != models.UserRole.ADMIN.value:
                existing.role = models.UserRole.ADMIN.value
                await session.commit()
                print(f"Promoted {email} to admin")
            else:
                print("Already admin")
            return

        user = models.User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=models.UserRole.ADMIN.value,
            is_active=True
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        print(f"Created admin user: {email} id={user.id}")

if __name__ == "__main__":
    import sys
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@allodoctor.cm"
    password = sys.argv[2] if len(sys.argv) > 2 else "Th@9Sand5uNny"
    name = sys.argv[3] if len(sys.argv) > 3 else "Admin"
    asyncio.run(create_admin(email, password, name))
