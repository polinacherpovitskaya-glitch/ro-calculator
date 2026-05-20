import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, error, integer, dateValue } from './work-utils.js';
import {
  factualMargin,
  productTypes,
  productionLoad,
  revenueByMonth,
  statusDynamics,
  summary,
  topClients,
} from '../analytics/queries.js';

const router = Router();

function parseYear(value, fallback) {
  const year = integer(value, fallback);
  return year && year >= 2000 && year <= 2100 ? year : null;
}

function parseLimit(value, fallback = 20) {
  const limit = integer(value, fallback);
  if (!limit || limit < 1) return fallback;
  return Math.min(limit, 100);
}

function parsePeriod(req, res) {
  const from = req.query.from ? dateValue(req.query.from) : null;
  const to = req.query.to ? dateValue(req.query.to) : null;
  if (req.query.from && !from) {
    error(res, 400, 'INVALID_PERIOD', 'from должен быть YYYY-MM-DD');
    return null;
  }
  if (req.query.to && !to) {
    error(res, 400, 'INVALID_PERIOD', 'to должен быть YYYY-MM-DD');
    return null;
  }
  return { from, to };
}

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await summary(period) });
  })
);

router.get(
  '/revenue-by-month',
  requireAuth,
  asyncHandler(async (req, res) => {
    const nowYear = new Date().getFullYear();
    const yearFrom = parseYear(req.query.year_from, nowYear);
    const yearTo = parseYear(req.query.year_to, yearFrom || nowYear);
    if (!yearFrom || !yearTo || yearTo < yearFrom) {
      return error(res, 400, 'INVALID_PERIOD', 'year_from/year_to должны быть 2000-2100');
    }
    res.json({ data: await revenueByMonth(yearFrom, yearTo) });
  })
);

router.get(
  '/top-clients',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await topClients(period, parseLimit(req.query.limit)) });
  })
);

router.get(
  '/status-dynamics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await statusDynamics(period) });
  })
);

router.get(
  '/production-load',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await productionLoad(period) });
  })
);

router.get(
  '/product-types',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await productTypes(period) });
  })
);

router.get(
  '/factual-margin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    res.json({ data: await factualMargin(period) });
  })
);

export default router;
