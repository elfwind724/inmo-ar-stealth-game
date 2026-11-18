const slowdown = [96, 125, 162, 216];

export function createDrawMotion(stage) {
  const document = stage.ownerDocument;
  const window = document.defaultView;
  const caption = stage.querySelector('#draw-caption');
  const display = stage.querySelector('.draw-display');
  const number = stage.querySelector('#draw-number');
  const team = stage.querySelector('#draw-team');
  const priorNumber = document.createElement('span');
  const sparks = document.createElement('span');
  const announcement = document.createElement('p');
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  display.setAttribute('aria-hidden', 'true');
  caption.setAttribute('aria-hidden', 'true');
  team.setAttribute('aria-hidden', 'true');
  priorNumber.className = 'draw-prior-number';
  sparks.className = 'draw-sparks';
  for (let index = 0; index < 8; index += 1) sparks.appendChild(document.createElement('i'));
  announcement.className = 'visually-hidden';
  announcement.setAttribute('role', 'status');
  display.appendChild(priorNumber);
  sparks.setAttribute('aria-hidden', 'true');
  stage.appendChild(sparks);
  stage.parentNode.insertBefore(announcement, stage.nextSibling);

  let position = 0;
  let reel = [];
  let timer;
  let pendingReveal;
  let incoming;
  let outgoing;

  function cancelAnimations() {
    incoming?.cancel();
    outgoing?.cancel();
    incoming = outgoing = undefined;
    priorNumber.textContent = '';
  }

  function stop() {
    window.clearTimeout(timer);
    pendingReveal?.(false);
    pendingReveal = undefined;
    cancelAnimations();
  }

  function roll(duration) {
    const old = number.textContent;
    cancelAnimations();
    position = (position + 1) % reel.length;
    number.textContent = reel[position];
    if (!number.animate) return;
    priorNumber.textContent = old;
    const options = { duration, easing: 'cubic-bezier(.2,.68,.34,1)' };
    incoming = number.animate([
      { transform: 'translateY(47%) scale(.93)', opacity: .18 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], options);
    outgoing = priorNumber.animate([
      { transform: 'translateY(0) scale(1)', opacity: .9 },
      { transform: 'translateY(-54%) scale(.93)', opacity: 0 },
    ], { ...options, fill: 'both' });
  }

  function spin(numberLimit = 13) {
    stop();
    const limit = Number.isInteger(numberLimit) && numberLimit >= 1 && numberLimit <= 500 ? numberLimit : 13;
    reel = Array.from({ length: limit }, (_, index) => (
      index % 2 === 0 ? index / 2 + 1 : limit - Math.floor(index / 2)
    ));
    position = 0;
    caption.textContent = '正在抽号';
    team.textContent = '';
    announcement.textContent = '';
    number.textContent = motionPreference?.matches === false ? reel[position] : '—';
    stage.dataset.state = 'spinning';
    stage.hidden = false;
    if (motionPreference?.matches !== false) return;

    function next() {
      if (motionPreference.matches) {
        cancelAnimations();
        number.textContent = '—';
        return;
      }
      roll(92);
      timer = window.setTimeout(next, 112);
    }
    timer = window.setTimeout(next, 112);
  }

  function reveal(value, name) {
    const animate = stage.dataset.state === 'spinning' && motionPreference?.matches === false;
    const finish = () => {
      cancelAnimations();
      stage.dataset.state = 'result';
      caption.textContent = '你的彩排顺序';
      number.textContent = value;
      team.textContent = name;
      stage.hidden = false;
      announcement.textContent = `${name}，彩排顺序第 ${value} 号。`;
    };

    stop();
    if (!animate) {
      finish();
      return Promise.resolve(true);
    }

    stage.dataset.state = 'settling';
    return new Promise((resolve) => {
      pendingReveal = resolve;
      function settle(step) {
        if (step === slowdown.length || motionPreference.matches) {
          pendingReveal = undefined;
          finish();
          resolve(true);
          return;
        }
        roll(slowdown[step] - 15);
        timer = window.setTimeout(() => settle(step + 1), slowdown[step]);
      }
      settle(0);
    });
  }

  function clear() {
    stop();
    stage.hidden = true;
    delete stage.dataset.state;
    announcement.textContent = '';
  }

  return { spin, reveal, clear };
}
