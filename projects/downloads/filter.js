(function () {
  var filters = document.getElementById('filters');
  var search = document.getElementById('search');
  var results = document.getElementById('results');
  var empty = document.getElementById('empty');
  var cards = document.querySelectorAll('[data-app]');
  var buttons = filters.querySelectorAll('[data-view]');
  var view = 'all';
  function update() {
    var terms = search.value.toLowerCase().trim().split(/\s+/);
    var count = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var text = card.getAttribute('data-app');
      var visible = terms.every(function (term) { return text.indexOf(term) !== -1; }) &&
        (view !== 'ready' || card.hasAttribute('data-ready')) &&
        (view !== 'checked' || card.hasAttribute('data-tested'));
      card.hidden = !visible;
      if (visible) count++;
    }
    results.textContent = '显示 ' + count + ' / ' + cards.length + ' 款';
    empty.hidden = count !== 0;
  }
  search.addEventListener('input', update);
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      view = this.getAttribute('data-view');
      for (var j = 0; j < buttons.length; j++) buttons[j].setAttribute('aria-pressed', buttons[j] === this ? 'true' : 'false');
      update();
    });
  }
  filters.hidden = false;
}());
