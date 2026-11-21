(() => {
  'use strict';
  const TIME_ZONE = 'America/Los_Angeles';
  const RENDER_EVERY_MS = 30 * 1000;    // recompute "On now" / "Up next"
  const RELOAD_DATA_EVERY_MS = 60 * 1000; // re-read events.js written by update_events.sh
  const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000; // events with no end time

  const params = new URLSearchParams(location.search);
  const floorParam = Number(params.get('floor'));
  const currentFloor = [1, 2, 3, 4].includes(floorParam) ? floorParam : null;
  const container = document.getElementById('floors');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = date => {
    const [, time, period] = clock.format(date).match(/^(.*?)\s*([AP]M)$/) || [null, clock.format(date), ''];
    return { time, period };
  };
  // "5:00–6:30 PM", or "11:00 AM–1:00 PM" when the period changes.
  function formatRange(start, end) {
    const a = parts(start);
    if (!end) return `${a.time} ${a.period}`;
    const b = parts(end);
    const sameDay = dayKey.format(start) === dayKey.format(end);
    if (!sameDay) return `${a.time} ${a.period}–${b.time} ${b.period}`;
    return a.period === b.period ? `${a.time}–${b.time} ${b.period}` : `${a.time} ${a.period}–${b.time} ${b.period}`;
  }

  // Turn the feed into displayable events for "now", dropping anything finished
  // or (as a safety net if the feed goes stale) anything not happening today.
  function currentEvents(now) {
    const today = dayKey.format(now);
    return (window.MOX_EVENTS || []).map(item => {
      const start = new Date(item.start);
      const end = item.end ? new Date(item.end) : null;
      const endsAt = end ? end.getTime() : start.getTime() + DEFAULT_LENGTH_MS;
      return { ...item, start, end, endsAt };
    }).filter(e => !Number.isNaN(e.start.getTime()) && e.endsAt > now.getTime()
      && (e.start <= now || dayKey.format(e.start) === today))
      .map(e => ({ ...e, isNow: e.start <= now }))
      .sort((a, b) => (b.isNow - a.isNow) || (a.start - b.start));
  }

  let lastSignature = '';
  function render() {
    const now = new Date();
    const events = currentEvents(now);
    const rows = [];
    for (const floor of [1, 2, 3, 4]) {
      const floorEvents = events.filter(item => item.floor === floor);
      const here = floor === currentFloor;
      const row = el('article', `floor${here ? ' here' : ''}${floorEvents.length ? '' : ' empty'}`);
      row.setAttribute('aria-label', `Floor ${floor}${here ? ', you are here' : ''}`);
      const marker = el('div', 'floor-marker');
      const label = el('div', 'floor-label');
      label.append(el('span', 'floor-ordinal', ['1st', '2nd', '3rd', '4th'][floor - 1]), el('span', 'floor-word', 'floor'));
      marker.append(label);
      if (here) marker.append(el('span', 'here-label', 'You are here'));
      const list = el('ul', 'event-list');
      for (const event of floorEvents) {
        const item = el('li', 'event');
        item.append(el('h2', '', event.title));
        const schedule = el('div', 'schedule');
        schedule.append(el('span', `status ${event.isNow ? 'now' : ''}`, event.isNow ? 'On now' : 'Up next'));
        schedule.append(el('p', '', formatRange(event.start, event.end)));
        item.append(schedule);
        list.append(item);
      }
      if (!floorEvents.length) {
        const item = el('li', 'event no-event');
        item.append(el('h2', '', 'No events scheduled'));
        list.append(item);
      }
      row.append(marker, list);
      rows.push(row);
    }
    // Skip the DOM swap (and refit) when nothing visible changed.
    const signature = rows.map(row => row.outerHTML).join('');
    if (signature === lastSignature) return;
    lastSignature = signature;
    container.replaceChildren(...rows);
  }

  // Re-read events.js with a cache-busting script tag. This works from file://
  // as well as over HTTP. If the load fails, keep showing the last good data.
  function reloadData() {
    const script = document.createElement('script');
    script.src = `events.js?t=${Date.now()}`;
    script.onload = () => { script.remove(); render(); };
    script.onerror = () => script.remove();
    document.head.append(script);
  }

  // Fit actual rendered content, including long titles and simultaneous events.
  // Scale typography and spacing together; keep the screen itself viewport-sized.
  const screen = document.querySelector('.screen');
  let pendingFrame;
  function fitScreen() {
    container.style.gridTemplateRows = [...container.children].map(row => `minmax(min-content, ${Math.max(1, row.querySelectorAll('.event').length)}fr)`).join(' ');
    screen.style.transform = '';
    screen.style.transformOrigin = 'top left';
    const setScale = value => screen.style.setProperty('--fit', value);
    const fits = () => screen.scrollWidth <= screen.clientWidth && screen.scrollHeight <= screen.clientHeight;
    setScale(1);
    if (fits()) return;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 16; step++) {
      const middle = (low + high) / 2;
      setScale(middle);
      if (fits()) low = middle;
      else high = middle;
    }
    setScale(low * 0.995);
    // Borders and pixel rounding have a minimum size, even at a tiny font size.
    // A final proportional fit handles extremely small viewports as well.
    if (!fits()) {
      const scale = Math.min(screen.clientWidth / screen.scrollWidth, screen.clientHeight / screen.scrollHeight);
      screen.style.transform = `scale(${scale})`;
    }
  }
  function scheduleFit() {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(fitScreen);
  }
  window.addEventListener('resize', scheduleFit);
  window.visualViewport?.addEventListener('resize', scheduleFit);
  screen.querySelectorAll('img').forEach(img => img.addEventListener('load', scheduleFit));
  new MutationObserver(scheduleFit).observe(container, { childList: true, subtree: true, characterData: true });
  if (document.fonts) document.fonts.ready.then(scheduleFit);

  render();
  fitScreen();
  setInterval(render, RENDER_EVERY_MS);
  setInterval(reloadData, RELOAD_DATA_EVERY_MS);
})();
