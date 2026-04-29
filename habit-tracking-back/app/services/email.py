import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

settings = get_settings()


async def send_verification_email(to_email: str, token: str) -> None:
    """Send email verification link. Silently skips if SMTP is not configured."""
    if not settings.smtp_user or not settings.smtp_password:
        # Dev mode: print the link to console instead
        link = f"{settings.frontend_url}/verify-email?token={token}"
        print(f"\n[DEV] Verification link for {to_email}:\n  {link}\n")
        return

    link = f"{settings.frontend_url}/verify-email?token={token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Confirm your Adet account"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    text_body = f"Click the link to verify your email:\n\n{link}\n\nThe link expires in 24 hours."
    html_body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:8px">Confirm your email</h2>
      <p style="color:#555;margin-bottom:24px">Click the button below to verify your Adet account.</p>
      <a href="{link}"
         style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:8px;font-weight:600">
        Verify email
      </a>
      <p style="color:#999;font-size:12px;margin-top:24px">
        Link expires in 24 hours. If you didn't create an account, ignore this email.
      </p>
    </div>
    """

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        start_tls=True,
    )
