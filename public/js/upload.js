const API = (typeof window !== "undefined" && window.location.origin) || "";

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = document.getElementById("uploadStatus");
  status.textContent = "Uploading...";
  status.className = "upload-status uploading";

  const formData = new FormData(e.target);
  try {
    const res = await fetch(`${API}/api/upload`, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      status.textContent = "Uploaded! Redirecting to video...";
      status.className = "upload-status success";
      setTimeout(() => {
        window.location.href = `watch.html?id=${data.id}`;
      }, 1500);
    } else {
      status.textContent = data.error || "Upload failed.";
      status.className = "upload-status error";
    }
  } catch (err) {
    status.textContent = "Error: " + (err.message || "Could not upload.");
    status.className = "upload-status error";
  }
});
