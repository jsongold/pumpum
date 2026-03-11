var previews = {
  default: "{title}\n{role} \u00b7 {time}\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n{message content}\n\u2500\u2500\u2500",
  childpage: "{title} \u2192 link to child page\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n(content inside child page)"
};
function updatePreview() {
  document.getElementById("modePreview").textContent = previews[document.getElementById("transferMode").value] || "";
}
document.addEventListener("DOMContentLoaded", function() {
  var t = document.getElementById("token");
  var f = document.getElementById("format");
  var m = document.getElementById("transferMode");
  var s = document.getElementById("status");
  chrome.storage.local.get(["notionToken", "format", "transferMode"], function(d) {
    if (d.notionToken) t.value = d.notionToken;
    if (d.format) f.value = d.format;
    if (d.transferMode) m.value = d.transferMode;
    updatePreview();
  });
  m.addEventListener("change", updatePreview);
  document.getElementById("save").addEventListener("click", function() {
    var v = t.value.trim();
    if (!v) { s.textContent = "Token required"; s.className = "status err"; return; }
    if (v.indexOf("ntn_") !== 0) { s.textContent = "Token must start with ntn_"; s.className = "status err"; return; }
    chrome.storage.local.set({ notionToken: v, format: f.value, transferMode: m.value }, function() {
      s.textContent = "Saved \u2713"; s.className = "status ok";
      setTimeout(function() { s.textContent = ""; }, 2000);
    });
  });
});
