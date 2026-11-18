(function () {
  var help = document.getElementById('load-help');
  var message = document.getElementById('load-message');
  var app = document.getElementById('app-script');
  var ready = false;
  var timer;

  function showFailure() {
    if (ready) return;
    if (message) message.textContent = '页面加载较慢，请点击下方重新加载。';
    if (help) help.hidden = false;
  }

  window.RehearsalBoot = {
    ready: function () {
      ready = true;
      window.clearTimeout(timer);
      if (help) help.hidden = true;
    }
  };

  if (app) app.addEventListener('error', showFailure);
  timer = window.setTimeout(showFailure, 10000);
}());
