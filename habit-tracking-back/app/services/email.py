import httpx

from app.config import get_settings

settings = get_settings()


async def send_verification_email(to_email: str, token: str) -> None:
    """Send email verification link via SendGrid API or print to console in dev mode."""
    link = f"{settings.frontend_url}/verify-email?token={token}"

    if not settings.sendgrid_api_key:
        print(f"\n[DEV] Verification link for {to_email}:\n  {link}\n")
        return

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

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.smtp_from or "noreply@adet.app"},
        "subject": "Confirm your Adet account",
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body},
        ],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.sendgrid_api_key}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        resp.raise_for_status()
