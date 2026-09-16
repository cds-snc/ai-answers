// src/utils/normalizePathname.js
//
// Single shared copy of "strip a trailing slash, but never reduce the root
// path to an empty string" - routeTitleKeys.js, markdownRoutes.js, and
// server.js's own route-matching all independently reimplemented this same
// one-liner; a future change to the rule (e.g. also trimming a trailing
// query string) would have had to be made in three places to actually take
// effect everywhere.
export const normalizePathname = (pathname) => pathname.replace(/\/+$/, '') || '/';
