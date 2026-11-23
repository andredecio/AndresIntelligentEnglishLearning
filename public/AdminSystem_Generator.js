import { functions, db } from './firebase-services.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

let currentAuthenticatedUserData = null;
let curStep = 0, dir = 'next';
const wizardData = { cefr: '', learningPoint: [], theme: '', latestInternet: true, url: '', vocabWords: '', vocabCount: 0 };

export function updateGeneratorUI(augmentedUser) {
    currentAuthenticatedUserData = augmentedUser;
    const form = document.getElementById('contentGeneratorForm');
    const genBtn = form?.querySelector('button[type="submit"]');
    const statusDiv = document.getElementById('userPaymentStatus');
    if (!currentAuthenticatedUserData || !genBtn) {
        clearGeneratorUI();
        if (statusDiv) statusDiv.innerHTML = 'Please log in.';
        return;
    }
    const claims = currentAuthenticatedUserData.customClaims;
    const profile = currentAuthenticatedUserData.profile;
    const isAdmin = claims.admin;
    const canCreate = claims.canCreateModule || isAdmin;
    const planId = profile ? profile.paymentPlanId : 'N/A';
    const balance = profile && typeof profile.currentBalance === 'number' ? profile.currentBalance : 0;
    const currency = profile ? profile.currency || 'USD' : 'USD';
    if (statusDiv) statusDiv.innerHTML = `<strong>Plan:</strong> ${planId} | <strong>Balance:</strong> ${balance.toFixed(2)} ${currency}`;
    const disableForm = !canCreate || balance <= 0;
    if (genBtn) genBtn.disabled = disableForm;
    if (form) form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = disableForm);
}

export function clearGeneratorUI() {
    currentAuthenticatedUserData = null;
    const form = document.getElementById('contentGeneratorForm');
    if (form) {
        form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
        form.reset();
    }
    document.getElementById('userPaymentStatus').innerHTML = 'No user logged in.';
}

const steps = [
  {
    q: "What is the CEFR English level for your LESSON?",
    render: () => `<select id="w_cefr" style="width:100%;padding:8px;"><option value="A1">A1</option><option value="A2">A2</option><option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option></select>`,
    save: () => { wizardData.cefr = document.getElementById('w_cefr').value; }
  },
  {
    q: "Now what is the Learning Point for the LESSON?",
    render: async () => {
      let html = `<input type="text" id="w_lp_custom" placeholder="Type new learning point..." style="width:100%;padding:8px;margin-bottom:10px;"><div style="max-height:150px;overflow-y:auto;border:1px solid #ccc;padding:5px;">`;
      const snap = await getDocs(query(collection(db, "learning_points"), where("cefr", "==", wizardData.cefr)));
      snap.forEach(doc => {
        const lp = doc.data().name || doc.id;
        html += `<label style="display:block;margin:5px 0;"><input type="checkbox" name="w_lp" value="${lp}"> ${lp}</label>`;
      });
      return html + `</div>`;
    },
    save: () => {
      const custom = document.getElementById('w_lp_custom').value.trim();
      const checked = Array.from(document.querySelectorAll('input[name="w_lp"]:checked')).map(el => el.value);
      wizardData.learningPoint = custom ? [custom, ...checked] : checked;
    }
  },
  {
    q: "OK! Now, type, or select the Theme for your LESSON",
    render: () => `<input type="text" id="w_theme" placeholder="e.g., They've found MH370!" style="width:100%;padding:8px;">`,
    save: () => { wizardData.theme = document.getElementById('w_theme').value.trim(); }
  },
  {
    q: "Do you want our AI to pick up the latest information on your Theme from the Internet?",
    render: () => `<label style="margin-right:20px;"><input type="radio" name="w_latest" value="yes" checked> YES</label><label><input type="radio" name="w_latest" value="no"> NO</label>`,
    save: () => { wizardData.latestInternet = document.querySelector('input[name="w_latest"]:checked').value === 'yes'; }
  },
  {
    q: "Enter the URL of the media source",
    render: () => `<input type="url" id="w_url" placeholder="https://..." style="width:100%;padding:8px;">`,
    skip: () => wizardData.latestInternet,
    save: () => { wizardData.url = document.getElementById('w_url').value.trim(); }
  },
  {
    q: "Choose vocabulary words or enter a number for AI selection",
    render: () => `<input type="text" id="w_vocab" placeholder="Comma-separated words..." style="width:100%;padding:8px;margin-bottom:10px;"><input type="number" id="w_count" placeholder="AI word count (e.g. 5)" style="width:100%;padding:8px;">`,
    save: () => {
      wizardData.vocabWords = document.getElementById('w_vocab').value.trim();
      wizardData.vocabCount = parseInt(document.getElementById('w_count').value) || 0;
    }
  }
];

function initGenerator() {
    const openBtn = document.getElementById('openWizardBtn');
    const modal = document.getElementById('aiWizard');
    const nextBtn = document.getElementById('wizNextBtn');
    const backBtn = document.getElementById('wizBackBtn');

    async function renderStep() {
      if (steps[curStep].skip && steps[curStep].skip()) {
        curStep += (dir === 'next' ? 1 : -1);
        return renderStep();
      }
      if (backBtn) backBtn.style.display = curStep === 0 ? 'none' : 'inline-block';
      if (nextBtn) nextBtn.innerText = curStep === steps.length - 1 ? 'Finish' : 'Next';
      document.getElementById('wizardLabel').innerText = steps[curStep].q;
      document.getElementById('wizardControl').innerHTML = await steps[curStep].render();
    }

    if (openBtn && modal) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Wizard button clicked! Opening modal.");
            modal.classList.remove('hidden'); // <-- REMOVE the hidden class!
            modal.style.display = 'flex';
            curStep = 0;
            renderStep();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            dir = 'next';
            steps[curStep].save();
            if (curStep < steps.length - 1) {
                curStep++;
                await renderStep();
            } else {
                document.getElementById('wizardLabel').innerText = "Processing Your Lesson...";
                document.getElementById('wizardControl').innerHTML = `<div style="text-align:center;"><div class="spinner" style="margin:20px auto;width:45px;height:45px;border:5px solid #f3f3f3;border-top:5px solid #007bff;border-radius:50%;animation:spin 1s linear infinite;"></div><p style="font-weight:bold;">Working on it! 🚀</p><p style="color:#555;font-size:0.85rem;">This will take a bit of time. Feel free to continue with other things; your lesson will appear automatically on your content screen once ready!</p></div><style>@keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }</style>`;
                if (backBtn) backBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                console.log("Submitting payload to AI Agent:", wizardData);
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            dir = 'back';
            if (curStep > 0) { curStep--; await renderStep(); }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGenerator);
} else {
    initGenerator();
}
document.addEventListener('click', (e) => {
    console.log("CLICK DETECTED ON:", e.target, "Tag:", e.target.tagName, "Parent Form:", e.target.closest('form'));
});
