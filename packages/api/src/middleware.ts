import { Request, Response, NextFunction } from 'express';

export const rewriteRequestkMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && req.body.query) {
    req.body.query = stripBlockFromQuery(req.body.query);
  }
  next();
};


function stripBlockFromQuery(query: string): string {
  query = query.replace(/block\s*:\s*{[^}]*}(\s*,)?\s*|block\s*:\s*null(\s*,)?\s*/g, '');
  query = query.replace(/\(\s*,/g, '(');
  query = query.replace(/,\s*\)/g, ')');
  query = query.replace(/\(\s*\)/g, '');
  return query;
}
