const form = document.getElementById("draft-form");
const docTypeInput = document.getElementById("doc-type");
const titleInput = document.getElementById("title");
const recipientInput = document.getElementById("recipient");
const toneInput = document.getElementById("tone");
const dateTimeInput = document.getElementById("date-time");
const locationInput = document.getElementById("location");
const targetInput = document.getElementById("target");
const howToApplyInput = document.getElementById("how-to-apply");
const contactInput = document.getElementById("contact");

const generateBtn = document.getElementById("generate-btn");
const loadFactsBtn = document.getElementById("load-facts-btn");
const fillSampleBtn = document.getElementById("fill-sample-btn");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");
const errorBox = document.getElementById("error-message");
const loadingIndicator = document.getElementById("loading-indicator");
const statusMessage = document.getElementById("status-message");
const tabPreview = document.getElementById("tab-preview");
const tabEdit = document.getElementById("tab-edit");
const draftPreview = document.getElementById("draft-preview");
const draftEditor = document.getElementById("draft-editor");

let currentDraft = "";
let currentViewMode = "preview";

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("hidden");
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.classList.add("hidden");
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  if (isLoading) {
    loadingIndicator.classList.remove("hidden");
  } else {
    loadingIndicator.classList.add("hidden");
  }
}

function getSelectedPromptType() {
  const selected = document.querySelector('input[name="prompt_type"]:checked');
  return selected ? selected.value : "A";
}

function collectPayload() {
  return {
    doc_type: docTypeInput.value.trim(),
    title: titleInput.value.trim(),
    recipient: recipientInput.value.trim(),
    tone: toneInput.value.trim(),
    prompt_type: getSelectedPromptType(),
    facts: {
      date_time: dateTimeInput.value.trim(),
      location: locationInput.value.trim(),
      target: targetInput.value.trim(),
      how_to_apply: howToApplyInput.value.trim(),
      contact: contactInput.value.trim(),
    },
  };
}

function buildSafeFilename(rawTitle) {
  const cleaned = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${cleaned || "문서초안"}.md`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[확인 필요\]/g, '<span class="needs-check">[확인 필요]</span>');
}

function renderMarkdown(mdText) {
  if (!mdText.trim()) {
    return "여기에 생성된 문서 초안이 표시됩니다.";
  }

  const lines = mdText.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeList();
      html.push("<hr>");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    if (trimmed.startsWith("> ")) {
      html.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
    } else {
      html.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  closeList();
  return html.join("");
}

function updateDraftUI(text) {
  currentDraft = text;
  draftEditor.value = text;
  draftPreview.innerHTML = renderMarkdown(text);
  const hasContent = Boolean(text.trim());
  copyBtn.disabled = !hasContent;
  downloadBtn.disabled = !hasContent;
}

function switchView(mode) {
  currentViewMode = mode;
  const isPreview = mode === "preview";
  tabPreview.classList.toggle("active", isPreview);
  tabEdit.classList.toggle("active", !isPreview);
  draftPreview.classList.toggle("hidden", !isPreview);
  draftEditor.classList.toggle("hidden", isPreview);
  if (isPreview) {
    draftPreview.innerHTML = renderMarkdown(currentDraft);
  }
}

tabPreview.addEventListener("click", () => switchView("preview"));
tabEdit.addEventListener("click", () => switchView("edit"));

draftEditor.addEventListener("input", () => {
  currentDraft = draftEditor.value;
  const hasContent = Boolean(currentDraft.trim());
  copyBtn.disabled = !hasContent;
  downloadBtn.disabled = !hasContent;
});

const FACT_STORAGE_KEY = "doc_draft_fact_card";
const factFieldMap = {
  date_time: dateTimeInput,
  location: locationInput,
  target: targetInput,
  how_to_apply: howToApplyInput,
  contact: contactInput,
};

function saveFactCard() {
  const facts = {};
  for (const [key, input] of Object.entries(factFieldMap)) {
    facts[key] = input.value;
  }
  localStorage.setItem(FACT_STORAGE_KEY, JSON.stringify(facts));
}

function loadFactCard() {
  clearError();
  clearStatus();
  const raw = localStorage.getItem(FACT_STORAGE_KEY);
  if (!raw) {
    showError("저장된 사실 카드가 없습니다. 먼저 사실 카드를 입력해 주세요.");
    return;
  }

  try {
    const facts = JSON.parse(raw);
    for (const [key, input] of Object.entries(factFieldMap)) {
      input.value = typeof facts[key] === "string" ? facts[key] : "";
    }
    showStatus("저장된 사실 카드를 불러왔습니다.");
  } catch (err) {
    showError("저장된 사실 카드를 불러오는 중 문제가 발생했습니다.");
  }
}

for (const input of Object.values(factFieldMap)) {
  input.addEventListener("input", saveFactCard);
}

loadFactsBtn.addEventListener("click", loadFactCard);

fillSampleBtn.addEventListener("click", () => {
  clearError();
  clearStatus();
  docTypeInput.value = "안내문";
  toneInput.value = "공식적";
  titleInput.value = "2026학년도 2학기 교내 장학금 신청 안내";
  recipientInput.value = "학부 재학생 전체";
  dateTimeInput.value = "2026. 11. 25.(수) ~ 12. 2.(수) 18:00";
  locationInput.value = "학생회관 2층 학생지원팀 및 학교 포털";
  targetInput.value = "2026학년도 2학기 학부 재학생";
  howToApplyInput.value = "학교 포털 로그인 후 [장학금 신청] 메뉴에서 온라인 제출";
  contactInput.value = "학생지원팀 (02-1234-5678)";
  saveFactCard();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  clearStatus();

  const payload = collectPayload();
  if (!payload.doc_type || !payload.title) {
    showError("문서 종류와 제목은 반드시 입력해 주세요.");
    return;
  }

  setLoading(true);
  copyBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      showError(data.error || "초안을 생성하지 못했습니다. 입력 내용을 확인해 주세요.");
      return;
    }

    updateDraftUI(data.draft || "");
    switchView("preview");
    showStatus("초안이 생성되었습니다.");
  } catch (err) {
    showError("서버와 통신하는 중 오류가 발생했습니다. 서버가 켜져 있는지 확인해 주세요.");
  } finally {
    setLoading(false);
  }
});

function toCleanPlainText(mdText) {
  return mdText
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

copyBtn.addEventListener("click", async () => {
  if (!currentDraft) return;

  if (currentViewMode === "edit") {
    try {
      await navigator.clipboard.writeText(currentDraft);
      showStatus("마크다운 원본이 복사되었습니다.");
    } catch (err) {
      showError("복사에 실패했습니다. 결과 텍스트를 직접 선택해 복사해 주세요.");
    }
    return;
  }

  const cleanText = toCleanPlainText(currentDraft);
  const renderedHtml = renderMarkdown(currentDraft);

  try {
    if (window.ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/plain": new Blob([cleanText], { type: "text/plain" }),
        "text/html": new Blob([renderedHtml], { type: "text/html" }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(cleanText);
    }
    showStatus("이메일·카톡·문서용 깔끔한 형식으로 복사되었습니다.");
  } catch (err) {
    try {
      await navigator.clipboard.writeText(cleanText);
      showStatus("이메일·카톡·문서용 깔끔한 형식으로 복사되었습니다.");
    } catch (fallbackErr) {
      showError("복사에 실패했습니다. 결과 텍스트를 직접 선택해 복사해 주세요.");
    }
  }
});

downloadBtn.addEventListener("click", () => {
  if (!currentDraft) return;
  const blob = new Blob([currentDraft], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildSafeFilename(titleInput.value);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus("마크다운(.md) 파일로 다운로드했습니다.");
});
