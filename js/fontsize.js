// 글자 크게 (2026-11-02) — 위 탭 줄 끝에 단추 하나. 누를 때마다 보통 → 크게 → 아주 크게 → 보통.
// 저장하지 않는다(새로 열면 보통). 화면 글자는 rem 이라 html 글자 크기만 바꾸면 함께 커진다.
(function () {
  const STEPS = [["", "가 보통"], ["fs1", "가 크게"], ["fs2", "가 아주 크게"]];
  let i = 0;
  function mount() {
    const nav = document.querySelector("nav.tabs"); if (!nav || nav.querySelector(".fsbtn")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "fsbtn"; b.title = "글자 크기 바꾸기 (누를 때마다 보통 → 크게 → 아주 크게)";
    b.setAttribute("aria-label", "글자 크기 바꾸기");
    const show = () => { b.innerHTML = `<span aria-hidden="true">가</span> ${["크게", "더 크게", "보통"][i]}`; };
    b.onclick = () => {
      i = (i + 1) % STEPS.length;
      document.documentElement.classList.remove("fs1", "fs2");
      if (STEPS[i][0]) document.documentElement.classList.add(STEPS[i][0]);
      show();
    };
    show(); nav.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
