function responseHelpers(req, res, next) {
  res.ok = (data) => res.status(200).json({ success: true, data });
  res.created = (data) => res.status(201).json({ success: true, data });
  res.noContent = () => res.status(204).send();
  res.fail = (code, msg, status = 400) => res.status(status).json({ success: false, error: code, message: msg });
  next();
}

module.exports = responseHelpers;
