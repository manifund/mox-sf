const categories = {
  ai: { label: "AI Safety", className: "blue" },
  animal: { label: "Animal Welfare", className: "purple" },
  research: { label: "New frontiers", className: "green" },
  social: { label: "Socials & Misc", className: "gold" },
  tbd: { label: "Save the Date", className: "tbd" }
};

const fallbackEvents = [
  {
    "id": "fall-kickoff",
    "category": "social",
    "title": "Fall Season Kickoff Social",
    "date": "2026-11-15",
    "dayLabel": "Sunday",
    "time": "5:00 PM - 8:00 PM PT",
    "location": "Mox, 1680 Mission St, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "Mox Community",
    "role": "Hosts",
    "description": "Open the season with us: meet the people behind this month's talks, catch up with old friends, and get a preview of what's coming over the next four weeks.",
    "rsvp": null
  },
  {
    "id": "tbd-nov-18",
    "category": "ai",
    "title": "AI Safety talk - to be announced",
    "date": "2026-11-18",
    "dayLabel": "Wednesday",
    "time": "Evening - Time TBA",
    "location": "Mox, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "To be announced",
    "role": "Save the date",
    "description": "We're holding this spot on the calendar for an AI Safety talk. Speaker and topic coming soon - check back, or add the season calendar so it lands in yours automatically.",
    "rsvp": null
  },
  {
    "id": "tbd-nov-21",
    "category": "research",
    "title": "New Frontiers - to be announced",
    "date": "2026-11-21",
    "dayLabel": "Saturday",
    "time": "Afternoon - Time TBA",
    "location": "Mox, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "To be announced",
    "role": "Save the date",
    "description": "We're holding this spot on the calendar for a New Frontiers session. Speaker and topic coming soon.",
    "rsvp": null
  },
  {
    "id": "tbd-dec-02",
    "category": "animal",
    "title": "Animal Welfare discussion - to be announced",
    "date": "2026-12-02",
    "dayLabel": "Wednesday",
    "time": "Evening - Time TBA",
    "location": "Mox, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "To be announced",
    "role": "Save the date",
    "description": "We're holding this spot on the calendar for an Animal Welfare discussion. Speaker and topic coming soon.",
    "rsvp": null
  },
  {
    "id": "tbd-dec-05",
    "category": "ai",
    "title": "AI Safety talk - to be announced",
    "date": "2026-12-05",
    "dayLabel": "Saturday",
    "time": "Afternoon - Time TBA",
    "location": "Mox, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "To be announced",
    "role": "Save the date",
    "description": "We're holding this spot on the calendar for an AI Safety talk. Speaker and topic coming soon.",
    "rsvp": null
  },
  {
    "id": "tbd-dec-09",
    "category": "research",
    "title": "New Frontiers - to be announced",
    "date": "2026-12-09",
    "dayLabel": "Wednesday",
    "time": "Evening - Time TBA",
    "location": "Mox, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "To be announced",
    "role": "Save the date",
    "description": "We're holding this spot on the calendar for a New Frontiers session. Speaker and topic coming soon.",
    "rsvp": null
  },
  {
    "id": "fall-wrap",
    "category": "social",
    "title": "Season Wrap & Holiday Social",
    "date": "2026-12-15",
    "dayLabel": "Tuesday",
    "time": "6:00 PM - 9:00 PM PT",
    "location": "Mox, 1680 Mission St, San Francisco, CA",
    "listLocation": "Mox, San Francisco, CA",
    "speaker": "Mox Community",
    "role": "Hosts",
    "description": "Close out the season and the year together: reflections on the month's conversations, warm drinks, and a room full of people who like unusually good questions.",
    "rsvp": null
  }
];

let events = fallbackEvents;

let activeCategory = "all";
let selectedId = events[0].id;
const channelRows = { ai: 0, animal: 1, research: 2, social: 3 };

const eventList = document.querySelector(".event-list");
const detailPanel = document.querySelector(".detail-panel");
const detailBadge = document.querySelector(".detail-badge");
const detailTitle = document.querySelector(".detail-title");
const detailDate = document.querySelector(".detail-date");
const detailLocation = document.querySelector(".detail-location");
const detailDescription = document.querySelector(".detail-description");
const speakerName = document.querySelector(".speaker-name");
const speakerRole = document.querySelector(".speaker-role");
const speakerAvatar = document.querySelector(".speaker-avatar");
const rsvpLink = document.querySelector(".rsvp-link");

function formatMonth(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function formatDay(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", { day: "2-digit" });
}

function getEvent(id) {
  return events.find((event) => event.id === id) || events[0];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPast(event) {
  return event.date < todayStr();
}

function weekday(dateString, short) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
    weekday: short ? "short" : "long"
  });
}

function filteredEvents() {
  if (activeCategory === "all") return events;
  return events.filter((event) => event.category === activeCategory);
}

// Upcoming events first (chronological), past events muted and pushed below
function orderEvents(list) {
  const byDate = (a, b) => a.date.localeCompare(b.date);
  return {
    upcoming: list.filter((e) => !isPast(e)).sort(byDate),
    past: list.filter(isPast).sort(byDate)
  };
}

function eventRow(event) {
  const category = categories[event.category];
  const row = document.createElement("button");
  row.type = "button";
  row.className = `event-row${event.id === selectedId ? " is-selected" : ""}${event.tbd ? " is-tbd" : ""}${isPast(event) ? " is-past" : ""}`;
  row.dataset.event = event.id;
  row.setAttribute("role", "listitem");
  row.innerHTML = `
    <span class="event-date"><span>${formatMonth(event.date)}</span><span>${formatDay(event.date)}</span></span>
    <span class="event-summary">
      <span class="event-time"><span class="dot ${category.className}" title="${category.label}"></span>${weekday(event.date, true)} ${event.time}</span>
      <span class="event-name">${event.title}</span>
      <span class="event-place">${event.listLocation}</span>
    </span>
    <span class="tag ${category.className}">${category.label}</span>
    <span aria-hidden="true">&gt;</span>
  `;
  row.addEventListener("click", () => selectEvent(event.id));
  return row;
}

function renderEvents() {
  const { upcoming, past } = orderEvents(filteredEvents());
  const visibleEvents = [...upcoming, ...past];
  if (!visibleEvents.some((event) => event.id === selectedId)) {
    selectedId = upcoming[0]?.id || visibleEvents[0]?.id || events[0].id;
  }

  eventList.innerHTML = "";
  upcoming.forEach((event) => eventList.append(eventRow(event)));
  if (past.length) {
    const divider = document.createElement("div");
    divider.className = "past-divider";
    divider.setAttribute("aria-hidden", "true");
    divider.textContent = "PAST EVENTS";
    eventList.append(divider);
    past.forEach((event) => eventList.append(eventRow(event)));
  }

  renderDetail();
}

function renderDetail() {
  const event = getEvent(selectedId);
  const category = categories[event.category];
  detailBadge.className = `detail-badge ${category.className}`;
  detailBadge.textContent = category.label;
  detailTitle.textContent = event.title;
  detailDate.textContent = `${weekday(event.date)}, ${new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  })} - ${event.time}`;
  detailLocation.textContent = event.location;
  speakerName.textContent = event.speaker;
  speakerRole.textContent = event.role;
  if (speakerAvatar) {
    if (event.speakerPhoto) {
      speakerAvatar.classList.add("has-photo");
      speakerAvatar.style.backgroundImage = `url("${event.speakerPhoto}")`;
    } else {
      speakerAvatar.classList.remove("has-photo");
      speakerAvatar.style.backgroundImage = "";
    }
  }
  detailDescription.textContent = event.description;
  rsvpLink.hidden = !event.rsvp;
  if (event.rsvp) rsvpLink.href = event.rsvp;
}

function selectEvent(id) {
  selectedId = id;
  detailPanel.classList.remove("is-hidden");
  document.querySelector(".events-shell")?.classList.remove("detail-hidden");
  history.replaceState(null, "", `#event=${id}`);
  renderEvents();
  detailPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function setCategory(category) {
  activeCategory = category;
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === category);
    if (button.classList.contains("filter-pill") && category === "all") {
      button.classList.toggle("is-active", button.dataset.category === "all");
    }
  });
  document.querySelectorAll(".channel-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === category);
  });
  const tvScreen = document.querySelector(".tv-screen");
  if (tvScreen) {
    // Active channel's watercolor wash; deeper when a single channel is tuned
    tvScreen.style.setProperty("--wash", `url("assets/wash-${category === "all" ? "all" : category}.png")`);
    tvScreen.dataset.channel = category;
  }
  const tvWrap = document.querySelector(".tv-wrap");
  if (tvWrap && Object.hasOwn(channelRows, category)) {
    tvWrap.style.setProperty("--pointer-row", channelRows[category]);
  }
  renderEvents();
}

const seasonCalendarUrl =
  "https://calendar.google.com/calendar/u/0?cid=Y181NzZhYTA3NWJkMGRiZDU3MWEzYTU1MDBhNGFjYjVjMjg3ZGE1ZGQ2NjBmZGYxMjk4ZDMyMjhmODJlZTk5ODhjQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20";

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2200);
}

document.querySelectorAll("[data-category]").forEach((button) => {
  // Pressing the tuned channel again un-tunes it, like an old TV set
  button.addEventListener("click", () => {
    setCategory(button.dataset.category === activeCategory ? "all" : button.dataset.category);
  });
});

document.querySelector("[data-share-event]").addEventListener("click", async () => {
  const url = `${window.location.origin}${window.location.pathname}#event=${selectedId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Event link copied");
  } catch {
    showToast(url);
  }
});

document.querySelector("[data-copy-link]").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(seasonCalendarUrl);
    showToast("Calendar link copied");
  } catch {
    showToast(seasonCalendarUrl);
  }
});

document.querySelector(".close-detail").addEventListener("click", () => {
  detailPanel.classList.add("is-hidden");
  document.querySelector(".events-shell")?.classList.add("detail-hidden");
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function updateHeroParallax() {
  const layers = document.querySelectorAll("[data-parallax-y]");
  if (layers.length === 0) return;

  if (reduceMotion.matches || window.innerWidth <= 980) {
    layers.forEach((layer) => {
      layer.style.transform = "";
    });
    return;
  }

  // 0 at the top of the page, 1 after ~560px of scrolling - the window
  // in which the hero is still on stage
  const t = Math.min(1.2, window.scrollY / 560);
  layers.forEach((layer) => {
    const y = t * Number(layer.dataset.parallaxY || 0);
    const x = t * Number(layer.dataset.parallaxX || 0);
    layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });
}

let parallaxFrame = 0;
function requestParallaxUpdate() {
  if (parallaxFrame) return;
  parallaxFrame = requestAnimationFrame(() => {
    parallaxFrame = 0;
    updateHeroParallax();
  });
}

window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
window.addEventListener("resize", requestParallaxUpdate);
reduceMotion.addEventListener?.("change", requestParallaxUpdate);

function initEvents() {
  const sharedEventId = window.location.hash.match(/^#event=([\w-]+)$/)?.[1];
  const hasShared = sharedEventId && events.some((event) => event.id === sharedEventId);
  const nextUpcoming = orderEvents(events).upcoming[0];
  selectedId = hasShared ? sharedEventId : nextUpcoming?.id || events[0].id;
  renderEvents();
  if (hasShared) {
    document.querySelector(".tv-stage")?.scrollIntoView({ block: "center" });
  }
}

initEvents();
updateHeroParallax();

// Live events come from the mox-sf API when hosted there; events.json and the
// embedded fallback keep the page rendering offline / over file://.
async function loadLiveEvents() {
  for (const source of ["/api/fallseason/events", "events.json"]) {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        events = data;
        initEvents();
        return;
      }
    } catch {
      // try the next source
    }
  }
}

loadLiveEvents();
