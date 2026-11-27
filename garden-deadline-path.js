const isoDeadline = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?$/;
const rollingLabel = /^rolling(?: basis| deadlines?| applications?| submissions?)?\.?$/i;
const rollingStatement = /\b(?:no (?:application )?submission deadlines?|open until superseded|indefinite opportunity|(?:accepted|submitted|reviewed) (?:anytime|at any time|on (?:an? )?(?:rolling|continuing|ongoing) basis))\b/i;
const negativeSubmission = /\b(?:not|never) (?:be )?(?:accepted|submitted|reviewed)\b/i;

function deadlineInstant(value) {
  if (typeof value !== "string") return NaN;
  const raw = value.trim();
  const parts = isoDeadline.exec(raw);
  if (!parts) return NaN;
  const calendarDay = new Date(parts[1]);
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== parts[1]) {
    return NaN;
  }
  return Date.parse(raw);
}

function explicitlyRolling(description) {
  if (typeof description !== "string") return false;
  if (rollingLabel.test(description.trim())) return true;
  return description.split(/[.!?;]+/).some(statement =>
    rollingStatement.test(statement) && !negativeSubmission.test(statement));
}

/** Arrange existing crop slots by their published deadline, without changing them. */
export function makeDeadlinePath(slots) {
  const dated = [];
  const rolling = [];
  const unstated = [];
  slots.forEach((slot, order) => {
    const { deadline_parsed, deadline_precision, deadline_description } = slot.record;
    if (deadline_precision === "rolling") {
      rolling.push(slot);
    } else {
      const instant = deadlineInstant(deadline_parsed);
      if (Number.isFinite(instant)) dated.push({ slot, instant, order });
      else if (explicitlyRolling(deadline_description)) rolling.push(slot);
      else unstated.push(slot);
    }
  });
  dated.sort((first, second) => first.instant - second.instant || first.order - second.order);

  const terraces = [];
  const addTerrace = (id, label, members) => {
    if (members.length) terraces.push({ id, label, slots: members });
  };
  if (dated.length) {
    const firstYear = new Date(dated[0].instant).getUTCFullYear();
    const early = [];
    const late = [];
    const later = [];
    let laterStart;
    let laterEnd;
    for (const { slot, instant } of dated) {
      const date = new Date(instant);
      const year = date.getUTCFullYear();
      if (year === firstYear) {
        (date.getUTCMonth() < 6 ? early : late).push(slot);
      } else {
        later.push(slot);
        laterStart ??= year;
        laterEnd = year;
      }
    }
    addTerrace("jan-jun", `Jan–Jun ${firstYear}`, early);
    addTerrace("jul-dec", `Jul–Dec ${firstYear}`, late);
    if (later.length) {
      addTerrace("later", laterStart === laterEnd ? String(laterStart) : `${laterStart}–${laterEnd}`, later);
    }
  }
  addTerrace("rolling", "Rolling deadlines", rolling);
  addTerrace("unstated", "Deadline unstated", unstated);
  return { terraces, slots: terraces.flatMap(terrace => terrace.slots) };
}
