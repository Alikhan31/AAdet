from datetime import datetime, timedelta, timezone
import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()

# Bcrypt only accepts up to 72 bytes; normalize so hash and verify use the same input
BCRYPT_MAX_BYTES = 72


def _normalize_password_for_bcrypt(password: str) -> bytes:
    pwd_bytes = password.encode("utf-8")
    return pwd_bytes[:BCRYPT_MAX_BYTES] if len(pwd_bytes) > BCRYPT_MAX_BYTES else pwd_bytes


def get_password_hash(password: str) -> str:
    pwd = _normalize_password_for_bcrypt(password)
    return bcrypt.hashpw(pwd, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd = _normalize_password_for_bcrypt(plain_password)
    stored = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    return bcrypt.checkpw(pwd, stored)


def create_access_token(subject: str | int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {"sub": str(subject), "exp": expire}
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        sub: str | None = payload.get("sub")
        return sub
    except JWTError:
        return None
