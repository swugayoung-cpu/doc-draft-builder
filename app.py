import hashlib
import hmac
import logging
import os
from datetime import timedelta

from dotenv import load_dotenv
from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from google import genai

# .env 파일에서 환경변수(GEMINI_API_KEY, APP_PASSWORD 등)를 읽어옵니다.
load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-3.5-flash-lite"
MIN_PASSWORD_LENGTH = 8


def _build_secret_key() -> str:
    """Vercel 서버리스 환경에서도 세션 쿠키가 유지되도록 결정적인 비밀키를 생성합니다."""
    explicit = os.getenv("FLASK_SECRET_KEY", "").strip()
    if explicit:
        return explicit
    seed = f"{os.getenv('APP_PASSWORD', '')}:{os.getenv('GEMINI_API_KEY', '')}:doc-draft-builder"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


app.secret_key = _build_secret_key()
app.permanent_session_lifetime = timedelta(days=7)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


def _clean_text(value: object) -> str:
    """입력값을 문자열로 정리하고 앞뒤 공백을 제거합니다."""
    if value is None:
        return ""
    return str(value).strip()


def _get_configured_password() -> str:
    """환경변수에서 접근 비밀번호를 읽어옵니다."""
    return os.getenv("APP_PASSWORD", "").strip()


def _is_authenticated() -> bool:
    """현재 사용자가 비밀번호 인증을 통과했는지 확인합니다."""
    return bool(session.get("authenticated"))


def _format_input_block(data: dict) -> str:
    """사용자가 입력한 문서 정보를 AI에게 전달할 텍스트 블록으로 정리합니다."""
    facts = data.get("facts") if isinstance(data.get("facts"), dict) else {}

    fields = [
        ("문서 종류", _clean_text(data.get("doc_type"))),
        ("제목", _clean_text(data.get("title"))),
        ("받는 사람", _clean_text(data.get("recipient"))),
        ("어조", _clean_text(data.get("tone")) or "공식적"),
        ("일시", _clean_text(facts.get("date_time"))),
        ("장소", _clean_text(facts.get("location"))),
        ("대상", _clean_text(facts.get("target"))),
        ("신청 방법", _clean_text(facts.get("how_to_apply"))),
        ("문의처", _clean_text(facts.get("contact"))),
    ]

    lines = [f"- {label}: {val if val else '(입력 없음)'}" for label, val in fields]
    return "\n".join(lines)


def build_prompt(data: dict, prompt_type: str) -> str:
    """Prompt A 또는 Prompt B 규칙에 따라 Gemini에 보낼 프롬프트를 생성합니다."""
    doc_type = _clean_text(data.get("doc_type"))
    input_block = _format_input_block(data)

    if prompt_type == "B":
        return (
            f"당신은 대학 행정 직원입니다. 아래 입력 정보를 바탕으로 '{doc_type}' 초안을 작성해 주세요.\n\n"
            "[대학 행정 문서 작성 규칙]\n"
            "1. 6하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)이 빠짐없이 드러나는지 점검하여 구성하세요.\n"
            "2. 대학 행정 문서에 맞는 정중한 문체를 유지하고, 요청된 어조를 반영하세요.\n"
            "3. 문서 하단에 문의처를 반드시 포함하세요.\n"
            "4. 입력에 없는 내용은 절대 지어내지 말고 [확인 필요]로 표시하세요.\n\n"
            f"[입력 정보]\n{input_block}\n"
        )

    return (
        f"아래 입력 정보를 바탕으로 '{doc_type}' 초안을 작성해 주세요.\n\n"
        f"[입력 정보]\n{input_block}\n"
    )


@app.route("/login", methods=["GET", "POST"])
def login():
    """비밀번호 입력 화면을 보여주고 인증을 처리합니다."""
    if _is_authenticated():
        return redirect(url_for("index"))

    error = None
    if request.method == "POST":
        configured_pw = _get_configured_password()
        if len(configured_pw) < MIN_PASSWORD_LENGTH:
            logger.error("APP_PASSWORD 환경변수가 설정되지 않았거나 8자리 미만입니다.")
            error = "서버에 8자리 이상 접근 비밀번호(APP_PASSWORD)가 설정되어 있지 않습니다."
        else:
            entered_pw = _clean_text(request.form.get("password"))
            if len(entered_pw) < MIN_PASSWORD_LENGTH:
                error = f"비밀번호는 {MIN_PASSWORD_LENGTH}자리 이상 입력해 주세요."
            elif hmac.compare_digest(entered_pw, configured_pw):
                session.permanent = True
                session["authenticated"] = True
                return redirect(url_for("index"))
            else:
                error = "비밀번호가 올바르지 않습니다. 다시 확인해 주세요."

    return render_template("login.html", error=error)


@app.route("/logout", methods=["POST"])
def logout():
    """세션을 초기화하고 비밀번호 입력 화면으로 돌아갑니다."""
    session.clear()
    return redirect(url_for("login"))


@app.route("/manifest.webmanifest")
def manifest():
    """PWA 매니페스트 파일을 제공합니다."""
    return send_from_directory(
        app.static_folder,
        "manifest.webmanifest",
        mimetype="application/manifest+json",
    )


@app.route("/sw.js")
def service_worker():
    """PWA 서비스 워커를 루트 범위(/)로 제공합니다."""
    response = send_from_directory(
        app.static_folder,
        "sw.js",
        mimetype="application/javascript",
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/")
def index():
    """메인 웹 화면을 보여줍니다."""
    if not _is_authenticated():
        return redirect(url_for("login"))
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def generate_draft():
    """입력 정보를 검증하고 Gemini API를 호출해 문서 초안을 반환합니다."""
    if not _is_authenticated():
        return jsonify({"error": "접근 권한이 없습니다. 비밀번호를 먼저 입력해 주세요."}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "요청 형식이 올바르지 않습니다. 다시 시도해 주세요."}), 400

    doc_type = _clean_text(data.get("doc_type"))
    title = _clean_text(data.get("title"))

    if not doc_type or not title:
        return jsonify({"error": "문서 종류와 제목은 반드시 입력해 주세요."}), 400

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")
        return jsonify({"error": "서버 설정(API 키)이 완료되지 않아 초안을 생성할 수 없습니다."}), 500

    prompt_type = _clean_text(data.get("prompt_type")).upper()
    if prompt_type not in ("A", "B"):
        prompt_type = "A"

    prompt = build_prompt(data, prompt_type)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )
        draft_text = (response.text or "").strip()
        if not draft_text:
            logger.warning("Gemini API가 빈 응답을 반환했습니다.")
            return jsonify({"error": "AI가 초안을 생성하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요."}), 502

        return jsonify({"draft": draft_text})
    except Exception:
        logger.exception("Gemini API 호출 중 오류가 발생했습니다.")
        return jsonify({"error": "초안을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."}), 500


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
