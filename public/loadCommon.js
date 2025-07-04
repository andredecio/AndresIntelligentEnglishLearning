// loadCommon.js
fetch('common.html')
  .then(response => response.text())
  .then(html => {
    document.getElementById('common-html-placeholder').innerHTML = html;
    // Now dynamically load common.js
    const script = document.createElement('script');
    script.src = 'common.js';
    script.onload = () => {
      // Only after common.js is ready, load onboarding.js
      const onboardingScript = document.createElement('script');
      onboardingScript.src = 'onboarding.js';
      document.body.appendChild(onboardingScript);
    };
    document.body.appendChild(script);
  });
