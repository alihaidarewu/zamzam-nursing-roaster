/**
 * ═══════════════════════════════════════════════════════════
 *  Chapai Zamzam Clinic & Diagnostic Center
 *  Nursing Roster Generator — app.js
 *  Developer: Ali Haidar
 *
 *  ── EXACT ROTATION LOGIC ─────────────────────────────────
 *
 *  The 7-slot cycle per nurse (repeats endlessly):
 *
 *   Slot 0 → NIGHT   (Day 1: goes hospital evening, works through night)
 *   Slot 1 → NIGHT   (Day 2: goes hospital evening, comes back Day 3 morning)
 *   Slot 2 → OFF     (Day 3: mandatory rest — arrived from night duty)
 *   Slot 3 → EVENING (Day 4: back to work, evening shift)
 *   Slot 4 → EVENING (Day 5: evening shift)
 *   Slot 5 → MORNING (Day 6: morning shift)
 *   Slot 6 → MORNING (Day 7: morning shift)
 *   → repeats from Slot 0 (Night again)
 *
 *  Stagger offsets for N nurses so Day 1 already has all shifts covered:
 *   Nurse idx%7 == 0 → starts slot 0 (Night)
 *   Nurse idx%7 == 1 → starts slot 1 (Night)   [2nd night nurse if nCount≥2]
 *   Nurse idx%7 == 2 → starts slot 2 (OFF→ Eve next day)
 *   Nurse idx%7 == 3 → starts slot 3 (Evening)
 *   Nurse idx%7 == 4 → starts slot 4 (Evening)  [2nd eve nurse if eCount≥2]
 *   Nurse idx%7 == 5 → starts slot 5 (Morning)
 *   Nurse idx%7 == 6 → starts slot 6 (Morning)  [2nd morn nurse if mCount≥2]
 *
 *  Multiple nurses per shift: naturally happens because nurses with same
 *  slot-type are at different indices. Extra nurses cover from OFF pool
 *  if shift is still understaffed.
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ── Constants ───────────────────────────────────────────── */
const SHIFT_M   = 'M';    // Morning  06:00–14:00
const SHIFT_E   = 'E';    // Evening  14:00–22:00
const SHIFT_N   = 'N';    // Night    22:00–06:00
const SHIFT_OFF = 'OFF';  // Rest day

const SAMPLE_NURSES = [
  'Amina Rahman', 'Laila Akter', 'Shamima Khatun', 'Farzana Sultana', 'Rumana Islam',
  'Nusrat Jahan', 'Rabeya Begum', 'Sadia Parveen', 'Taslima Begum', 'Mina Akter',
  'Jannatul Ferdous', 'Roksana Akhter', 'Naznin Nahar', 'Marium Sultana', 'Khadija Hasan'
];

/*
 * THE CANONICAL CYCLE — 7 slots, repeating forever.
 * Index into this with (startOffset + day) % 7
 */
const CYCLE     = [SHIFT_N, SHIFT_N, SHIFT_OFF, SHIFT_E, SHIFT_E, SHIFT_M, SHIFT_M];
const CYCLE_LEN = CYCLE.length; // 7

/*
 * Default start offsets for staggering nurses across the cycle.
 * Ensures Day 1 has Night + Evening + Morning coverage immediately.
 * Pattern repeats every 7 nurses; with fewer nurses the pattern
 * still guarantees spread across the 3 working slots (0,3,5).
 */
const STAGGER = [0, 1, 3, 4, 5, 6, 2]; // maps nurseIndex % 7 → cycleOffset

/* ── State ──────────────────────────────────────────────── */
let nurses        = [];
let currentRoster = null;
let dateMode      = 'month';

/* ── DOM helpers ─────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandomSample(count) {
  const shuffled = shuffleArray(SAMPLE_NURSES);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/* ── Initialise ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildParticles();
  populateMonthYear();
  loadFromStorage();
  renderNurseList();
  updateNurseCount();
});

/* ── Ambient Particles ───────────────────────────────────── */
function buildParticles() {
  const cont = $('bgParticles');
  for (let i = 0; i < 14; i++) {
    const p = el('div', 'particle');
    const size = Math.random() * 220 + 80;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      top:${Math.random() * 130 + 10}%;
      animation-duration:${Math.random() * 20 + 14}s;
      animation-delay:-${Math.random() * 20}s;
    `;
    cont.appendChild(p);
  }
}

/* ── Month / Year selects ────────────────────────────────── */
function populateMonthYear() {
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const mSel = $('monthSelect');
  const ySel = $('yearSelect');
  months.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = m;
    mSel.appendChild(opt);
  });
  const now = new Date();
  mSel.value = now.getMonth();
  const yr = now.getFullYear();
  for (let y = yr - 2; y <= yr + 3; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    ySel.appendChild(opt);
  }
  ySel.value = yr;
}

/* ── Date Mode Switch ────────────────────────────────────── */
function switchDateMode(mode) {
  dateMode = mode;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-mode="${mode}"]`).classList.add('active');
  $('monthMode').style.display  = mode === 'month'  ? 'flex' : 'none';
  $('customMode').style.display = mode === 'custom' ? 'flex' : 'none';
}

/* ── Build date array ────────────────────────────────────── */
function buildDateRange() {
  const dates = [];
  if (dateMode === 'month') {
    const m = parseInt($('monthSelect').value);
    const y = parseInt($('yearSelect').value);
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) dates.push(new Date(y, m, d));
  } else {
    const s = new Date($('startDate').value);
    const e = new Date($('endDate').value);
    if (isNaN(s) || isNaN(e) || s > e) return null;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1))
      dates.push(new Date(d));
  }
  return dates;
}

/* ── Nurse Management ────────────────────────────────────── */
function addNurse() {
  const input = $('nurseInput');
  const name  = input.value.trim();
  if (!name) { showNotification('Please enter a nurse name.', 'error'); return; }
  if (nurses.some(n => n.toLowerCase() === name.toLowerCase())) {
    showNotification(`"${name}" is already in the list.`, 'error'); return;
  }
  nurses.push(name);
  saveToStorage();
  renderNurseList();
  updateNurseCount();
  input.value = '';
  input.focus();
  showNotification(`${name} added successfully.`, 'success');
}

function removeNurse(idx) {
  const name = nurses[idx];
  nurses.splice(idx, 1);
  saveToStorage();
  renderNurseList();
  updateNurseCount();
  showNotification(`${name} removed.`, 'success');
}

function renderNurseList() {
  const list = $('nurseList');
  list.innerHTML = '';
  nurses.forEach((name, idx) => {
    const chip = el('div', 'nurse-chip');
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    chip.innerHTML = `
      <div class="nurse-avatar">${initials}</div>
      <span class="nurse-name-text">${name}</span>
      <button type="button" class="remove-btn" onclick="removeNurse(${idx})" title="Remove" aria-label="Remove ${name}">✕</button>
    `;
    list.appendChild(chip);
  });
}

function updateNurseCount() {
  const bar = $('nurseCount');
  if (nurses.length === 0) {
    bar.innerHTML = '';
  } else {
    bar.innerHTML = `<span class="count-dot"></span> ${nurses.length} nurse${nurses.length !== 1 ? 's' : ''} registered`;
  }
}

/* ═══════════════════════════════════════════════════════════
   CORE ALGORITHM
   ═══════════════════════════════════════════════════════════

   Step 1 — buildRawSchedules()
   ────────────────────────────
   For each nurse, compute their shift for every date using the
   7-slot cycle. Nurse i gets startOffset = STAGGER[i % 7].
   shift[nurse][day] = CYCLE[ (startOffset + day) % 7 ]

   That's it. The OFF day is baked into the cycle at slot 2.

   Step 2 — assignShifts()
   ────────────────────────
   Collect who lands on M/E/N/OFF each day.
   If any shift is under its required count, pull nurses from the
   OFF pool (sorted by fewest total shifts worked so far).
   This preserves the rest day for the nurse whenever possible,
   only breaking it when absolutely needed for coverage.

   Summary counters track M/E/N/OFF per nurse across all days.
══════════════════════════════════════════════════════════════ */

/**
 * Returns raw schedule: schedules[nurseName][dayIndex] = SHIFT_M/E/N/OFF
 */
function buildRawSchedules(nurseList, useRandomOffsets = false) {
  const schedules = {};
  const offsets = useRandomOffsets ? shuffleArray(STAGGER) : STAGGER;
  nurseList.forEach((name, idx) => {
    const offset = offsets[idx % CYCLE_LEN];
    schedules[name] = { offset };
  });
  return schedules;
}

function getShiftForDay(schedules, nurseName, dayIndex) {
  return CYCLE[(schedules[nurseName].offset + dayIndex) % CYCLE_LEN];
}

/**
 * Main function: assigns all shifts across all dates.
 */
function assignShifts(nurseList, dates, mCount, eCount, nCount, options = {}) {
  const schedules = buildRawSchedules(nurseList, options.randomizeOffsets === true);
  const summary   = Object.fromEntries(nurseList.map(n => [n, { M: 0, E: 0, N: 0, OFF: 0 }]));
  const roster    = [];

  dates.forEach((date, d) => {
    // ── Step 1: classify each nurse by their raw cycle shift today ──
    const todayM   = [];
    const todayE   = [];
    const todayN   = [];
    const todayOFF = [];

    nurseList.forEach(name => {
      const shift = getShiftForDay(schedules, name, d);
      if      (shift === SHIFT_M)   todayM.push(name);
      else if (shift === SHIFT_E)   todayE.push(name);
      else if (shift === SHIFT_N)   todayN.push(name);
      else                          todayOFF.push(name);
    });

    // Keep a mutable copy of OFF pool to draw from if needed
    const offPool = [...todayOFF];

    // ── Step 2: fill under-staffed shifts from OFF pool ──
    /**
     * Pull up to (needed - assigned.length) nurses from offPool.
     * Nurses are sorted by fewest shifts worked — preserves fairness.
     * A nurse pulled from OFF still gets their rest broken only
     * if no other option exists.
     */
    const fillFromOff = (assigned, needed) => {
      if (assigned.length >= needed) return assigned;
      const deficit = needed - assigned.length;
      // Sort OFF pool by total shifts worked (ascending = most rested first)
      offPool.sort((a, b) => {
        const ta = summary[a].M + summary[a].E + summary[a].N;
        const tb = summary[b].M + summary[b].E + summary[b].N;
        return ta - tb;
      });
      const extras = offPool.splice(0, deficit); // remove from pool so they're not reused
      return [...assigned, ...extras];
    };

    // Respect required counts
    const finalN = fillFromOff(todayN, nCount);
    const finalE = fillFromOff(todayE, eCount);
    const finalM = fillFromOff(todayM, mCount);

    // ── Step 3: determine who is truly OFF today ──
    const workingToday = new Set([...finalN, ...finalE, ...finalM]);
    const finalOFF     = nurseList.filter(n => !workingToday.has(n));

    // ── Step 4: update summary counters ──
    finalM.forEach(n => summary[n].M++);
    finalE.forEach(n => summary[n].E++);
    finalN.forEach(n => summary[n].N++);
    finalOFF.forEach(n => summary[n].OFF++);

    roster.push({ date, morning: finalM, evening: finalE, night: finalN, off: finalOFF });
  });

  return { roster, summary };
}

/* ── Generate Roster ─────────────────────────────────────── */
function generateRoster() {
  if (nurses.length === 0) {
    showNotification('Please add at least one nurse before generating.', 'error');
    return;
  }
  const dates = buildDateRange();
  if (!dates || dates.length === 0) {
    showNotification('Please select a valid date range.', 'error');
    return;
  }

  const mCount = Math.max(1, parseInt($('morningCount').value) || 1);
  const eCount = Math.max(1, parseInt($('eveningCount').value) || 1);
  const nCount = Math.max(1, parseInt($('nightCount').value)   || 1);
  const minNeeded = Math.max(mCount, eCount, nCount);

  if (nurses.length < minNeeded) {
    showNotification(
      `Need at least ${minNeeded} nurse(s) to cover the largest shift slot.`, 'error'
    );
    return;
  }

  showLoading('Building 2-day rotation schedule…');
  setTimeout(() => {
    try {
      const { roster, summary } = assignShifts(nurses, dates, mCount, eCount, nCount);
      currentRoster = { roster, summary, dates, mCount, eCount, nCount };
      renderRoster(roster, summary, dates);
      $('regenBtn').style.display = '';
      $('pdfBtn').style.display   = '';
      hideLoading();
      $('rosterSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showNotification('✓ Roster generated with correct Night rest rules!', 'success');
    } catch (err) {
      hideLoading();
      showNotification('Something went wrong. Please try again.', 'error');
      console.error(err);
    }
  }, 700);
}

/* Regenerate simply reshuffles stagger by rotating nurse order */
function regenerateRoster() {
  if (!currentRoster) return;
  showLoading('Creating a brand new roster…');
  setTimeout(() => {
    try {
      const { dates, mCount, eCount, nCount } = currentRoster;
      const shuffledNurses = shuffleArray(nurses);
      const { roster, summary } = assignShifts(shuffledNurses, dates, mCount, eCount, nCount, { randomizeOffsets: true });
      currentRoster = { ...currentRoster, roster, summary };
      renderRoster(roster, summary, dates);
      hideLoading();
      showNotification('A fresh roster has been created successfully!', 'success');
    } catch (err) {
      hideLoading();
      showNotification('Error generating a fresh roster.', 'error');
      console.error(err);
    }
  }, 500);
}

/* ── Render Roster ───────────────────────────────────────── */
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(d) {
  return `${String(d.getDate()).padStart(2,'0')} ${MON_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function renderRoster(roster, summary, dates) {
  const s = dates[0];
  const e = dates[dates.length - 1];
  $('rosterPeriodLabel').textContent = `${fmt(s)}  –  ${fmt(e)}   (${dates.length} days)`;
  $('printMeta').textContent =
    `Period: ${fmt(s)} — ${fmt(e)}   |   Days: ${dates.length}   |   Nurses: ${nurses.length}`;

  /* ── Stats ── */
  const statsRow    = $('statsRow');
  statsRow.innerHTML = '';
  const totalShifts = roster.reduce((a, r) => a + r.morning.length + r.evening.length + r.night.length, 0);
  const totalOff    = Object.values(summary).reduce((a, s) => a + s.OFF, 0);
  const avgPerNurse = nurses.length ? Math.round(totalShifts / nurses.length) : 0;

  [
    { v: dates.length,  l: 'Total Days'  },
    { v: nurses.length, l: 'Nurses'      },
    { v: totalShifts,   l: 'Shift Slots' },
    { v: totalOff,      l: 'Rest Days'   },
    { v: avgPerNurse,   l: 'Avg / Nurse' }
  ].forEach(stat => {
    const chip = el('div', 'stat-chip');
    chip.innerHTML = `<div class="stat-value">${stat.v}</div><div class="stat-label">${stat.l}</div>`;
    statsRow.appendChild(chip);
  });

  /* ── Nurse Breakdown ── */
  let breakdownEl = $('breakdownArea');
  if (!breakdownEl) {
    breakdownEl = el('div', '');
    breakdownEl.id = 'breakdownArea';
    $('rosterSection').querySelector('.card-header').insertAdjacentElement('afterend', breakdownEl);
  }
  breakdownEl.innerHTML = '';

  const toggleRow = el('div', 'breakdown-toggle');
  toggleRow.innerHTML = `<button class="btn btn-outline-sm" onclick="toggleBreakdown()" id="bdToggle">▸ Show nurse summary</button>`;
  breakdownEl.appendChild(toggleRow);

  const panel = el('div', 'breakdown-panel');
  panel.id = 'bdPanel';
  const grid = el('div', 'breakdown-grid');
  nurses.forEach(n => {
    const s     = summary[n];
    const total = s.M + s.E + s.N;
    const bc    = el('div', 'breakdown-card');
    bc.innerHTML = `
      <div class="breakdown-name">👩‍⚕️ ${n}</div>
      <div class="breakdown-shifts">
        <span class="bs m">🌅 M: ${s.M}</span>
        <span class="bs e">🌇 E: ${s.E}</span>
        <span class="bs n">🌙 N: ${s.N}</span>
        <span class="bs off">💤 Off: ${s.OFF}</span>
      </div>
      <div class="breakdown-total">Total worked: ${total} days</div>
    `;
    grid.appendChild(bc);
  });
  panel.appendChild(grid);
  breakdownEl.appendChild(panel);

  /* ── Legend ── */
  // let legendEl = $('rulesLegend');
  // if (!legendEl) {
  //   legendEl = el('div', 'rules-legend');
  //   legendEl.id = 'rulesLegend';
  //   breakdownEl.insertAdjacentElement('afterend', legendEl);
  // }
  // legendEl.innerHTML = `
  //   <div class="legend-title">📋 Rotation Cycle per Nurse (7-day repeating)</div>
  //   <div class="legend-items">
  //     <div class="legend-item"><span class="leg-dot n"></span> Day 1: Night (goes evening)</div>
  //     <div class="legend-item"><span class="leg-dot n"></span> Day 2: Night (comes back Day 3 morning)</div>
  //     <div class="legend-item"><span class="leg-dot off"></span> Day 3: <strong>OFF</strong> (mandatory rest)</div>
  //     <div class="legend-item"><span class="leg-dot e"></span> Day 4: Evening</div>
  //     <div class="legend-item"><span class="leg-dot e"></span> Day 5: Evening</div>
  //     <div class="legend-item"><span class="leg-dot m"></span> Day 6: Morning</div>
  //     <div class="legend-item"><span class="leg-dot m"></span> Day 7: Morning → 🔄 repeat</div>
  //   </div>
  // `;

  /* ── Table Body ── */
  const tbody = $('rosterBody');
  tbody.innerHTML = '';

  roster.forEach((row, idx) => {
    const dow       = row.date.getDay();
    const isWeekend = dow === 5 || dow === 6;
    const tr        = document.createElement('tr');
    if (isWeekend) tr.classList.add('weekend');

    const dayClass = isWeekend ? 'day-cell weekend' : 'day-cell weekday';

    const makePills = (arr, type) => {
      if (!arr || arr.length === 0) return '<span class="no-nurse">—</span>';
      return arr.map(n =>
        `<div class="nurse-pill ${type}"><span class="dot"></span>${n}</div>`
      ).join('');
    };

    const offPills = row.off && row.off.length
      ? row.off.map(n => `<span class="off-pill">💤 ${n}</span>`).join('')
      : '<span class="no-nurse">—</span>';

    tr.innerHTML = `
      <td class="num-cell" data-label="#">${idx + 1}</td>
      <td data-label="Date"><span class="date-cell">${fmt(row.date)}</span></td>
      <td data-label="Day"><span class="${dayClass}">${DAY_NAMES[dow].slice(0, 3)}</span></td>
      <td data-label="Morning"><div class="nurses-cell">${makePills(row.morning, 'morning')}</div></td>
      <td data-label="Evening"><div class="nurses-cell">${makePills(row.evening, 'evening')}</div></td>
      <td data-label="Night"><div class="nurses-cell">${makePills(row.night,   'night')}</div></td>
      <td data-label="Rest / Off"><div class="nurses-cell off-cell">${offPills}</div></td>
    `;
    tbody.appendChild(tr);
  });

  $('rosterSection').style.display = '';
}

function toggleBreakdown() {
  const panel  = $('bdPanel');
  const toggle = $('bdToggle');
  const open   = panel.classList.toggle('open');
  toggle.textContent = open ? '▾ Hide nurse summary' : '▸ Show nurse summary';
}

/* ── PDF Export ──────────────────────────────────────────── */
function downloadPDF() {
  if (!currentRoster) return;
  showLoading('Preparing PDF…');

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    /* ── Page dimensions & margins ── */
    const pageW  = 210;
    const pageH  = 297;
    const marginL = 10;
    const marginR = 10;
    const marginT = 12;
    const marginB = 12;
    const usableW = pageW - marginL - marginR;   // 190 mm

    /* ── Column widths (no serial, no rest) ──
       Date | Day | Morning | Evening | Night
    */
    const cols = [
      { label: 'Date',    w: 28 },
      { label: 'Day',     w: 14 },
      { label: 'Morning', w: 48 },
      { label: 'Evening', w: 50 },
      { label: 'Night',   w: 50 },
    ];
    // stretch to fill usableW
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const stretch = usableW / totalW;
    cols.forEach(c => { c.w = c.w * stretch; });

    /* ── Header block (clinic info) ── */
    function drawPageHeader(doc, startDate, endDate) {
      const x = marginL;
      let y = marginT;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.text('Chapai Zamzam Clinic & Diagnostic Center', pageW / 2, y, { align: 'center' });
      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Nursing Roster Schedule', pageW / 2, y, { align: 'center' });
      y += 5;

      // Period line
      const periodStr = `Period: ${fmt(startDate)} — ${fmt(endDate)}`;
      doc.setFontSize(9);
      doc.text(periodStr, pageW / 2, y, { align: 'center' });
      y += 4;

      // Horizontal rule
      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
      doc.line(marginL, y, pageW - marginR, y);
      y += 3;

      return y; // y after header
    }

    /* ── Draw table header row ── */
    function drawTableHeader(doc, y) {
      const rowH = 7;
      doc.setFillColor(220, 220, 220);
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.rect(marginL, y, usableW, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0);

      let x = marginL;
      cols.forEach(col => {
        doc.text(col.label, x + col.w / 2, y + rowH / 2 + 1.2, { align: 'center' });
        x += col.w;
      });

      // vertical lines inside header
      x = marginL;
      cols.forEach((col, i) => {
        if (i > 0) {
          doc.setDrawColor(0);
          doc.line(x, y, x, y + rowH);
        }
        x += col.w;
      });

      return y + rowH;
    }

    /* ── Draw one data row ── */
    function drawRow(doc, y, row, rowIndex) {
      const roster = currentRoster.roster;
      const entry  = roster[rowIndex];
      const dow    = entry.date.getDay();
      const isWeekend = dow === 5 || dow === 6; // Fri/Sat

      // Determine row height based on max nurses in any shift cell
      const maxNurses = Math.max(
        (entry.morning || []).length,
        (entry.evening || []).length,
        (entry.night   || []).length,
        1
      );
      const lineH = 4.5;
      const padV  = 2;
      const rowH  = maxNurses * lineH + padV * 2;

      // Background
      if (isWeekend) {
        doc.setFillColor(255, 245, 220);
      } else {
        doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 248);
      }
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.rect(marginL, y, usableW, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0);

      const cells = [
        fmt(entry.date),
        DAY_NAMES[dow].slice(0, 3),
        (entry.morning || []).join('\n') || '—',
        (entry.evening || []).join('\n') || '—',
        (entry.night   || []).join('\n') || '—',
      ];

      let x = marginL;
      cells.forEach((text, i) => {
        const col = cols[i];
        const lines = text.split('\n');
        lines.forEach((line, li) => {
          doc.text(line, x + col.w / 2, y + padV + lineH * li + lineH * 0.65, { align: 'center' });
        });
        // vertical divider
        if (i > 0) {
          doc.setDrawColor(180, 180, 180);
          doc.line(x, y, x, y + rowH);
        }
        x += col.w;
      });

      // bottom border
      doc.setDrawColor(180, 180, 180);
      doc.line(marginL, y + rowH, pageW - marginR, y + rowH);
      // left & right border
      doc.line(marginL, y, marginL, y + rowH);
      doc.line(pageW - marginR, y, pageW - marginR, y + rowH);

      return y + rowH;
    }

    /* ── Footer ── */
    function drawFooter(doc, pageNum) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(
        'Generated by Chapai Zamzam Clinic Nursing Roster System  •  Developed by Ali Haidar',
        pageW / 2, pageH - 6, { align: 'center' }
      );
      doc.text(`Page ${pageNum}`, pageW - marginR, pageH - 6, { align: 'right' });
    }

    /* ── Build pages ── */
    const roster     = currentRoster.roster;
    const startDate  = roster[0].date;
    const endDate    = roster[roster.length - 1].date;
    let pageNum      = 1;

    let curY = drawPageHeader(pdf, startDate, endDate);
    curY = drawTableHeader(pdf, curY);

    for (let i = 0; i < roster.length; i++) {
      // Estimate row height
      const entry = roster[i];
      const maxN  = Math.max((entry.morning||[]).length, (entry.evening||[]).length, (entry.night||[]).length, 1);
      const estH  = maxN * 4.5 + 4;

      if (curY + estH > pageH - marginB - 10) {
        drawFooter(pdf, pageNum);
        pdf.addPage();
        pageNum++;
        curY = drawPageHeader(pdf, startDate, endDate);
        curY = drawTableHeader(pdf, curY);
      }

      curY = drawRow(pdf, curY, null, i);
    }

    drawFooter(pdf, pageNum);

    const startStr = fmt(startDate).replace(/ /g, '_');
    pdf.save(`ZamzamClinic_Roster_${startStr}.pdf`);
    showNotification('PDF downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    showNotification('PDF generation failed. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

/* ── Notifications ───────────────────────────────────────── */
function showNotification(msg, type) {
  const n    = $('notification');
  const icon = type === 'success' ? '✓' : '⚠';
  n.innerHTML = `<span>${icon}</span> ${msg}`;
  n.className = `notification ${type}`;
  n.style.display = 'flex';
  clearTimeout(n._timer);
  n._timer = setTimeout(() => { n.style.display = 'none'; }, 5000);
}

/* ── Loading ─────────────────────────────────────────────── */
function showLoading(msg) {
  $('loadingText').textContent = msg || 'Loading…';
  $('loadingOverlay').style.display = 'grid';
}
function hideLoading() {
  $('loadingOverlay').style.display = 'none';
}

/* ── Local Storage ───────────────────────────────────────── */
function saveToStorage() {
  try { localStorage.setItem('zamzam_nurses', JSON.stringify(nurses)); } catch (e) {}
}
function loadFromStorage() {
  try {
    const saved = localStorage.getItem('zamzam_nurses');
    if (saved) {
      nurses = JSON.parse(saved);
    } else {
      nurses = pickRandomSample(7);
      saveToStorage();
      showNotification('Random nurse names loaded. You can edit the list anytime.', 'success');
    }
  } catch (e) {
    nurses = pickRandomSample(7);
  }
}
