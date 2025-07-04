fetch('common.html')
  .then(response => response.text())
  .then(html => {
    document.getElementById('common-html-placeholder').innerHTML = html;
    // Only now that popup exists, load common.js
    const script = document.createElement('script');
    script.src = 'common.js';
    document.body.appendChild(script);
  });
