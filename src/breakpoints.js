// One definition of "phone", shared by the stylesheet and every module that has
// to behave differently there. The .98 matters: `(max-width: 860px)` and
// `(min-width: 861px)` both fail at a fractional width like 860.5, which some
// Android zoom levels produce — and that gap left the page with the desktop grid
// but the phone's disabled behaviours.
// The height clause catches a phone held sideways: an iPhone Pro Max in landscape
// is 932px wide, comfortably "desktop" by width alone, but only ~430px tall — and
// the desktop layout is built from sticky full-height panels and a map stage with
// a 520px floor, none of which fit in that.
export const PHONE_QUERY = '(max-width: 860.98px), (max-height: 520px)';
export const phone = matchMedia(PHONE_QUERY);
