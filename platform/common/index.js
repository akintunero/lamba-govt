module.exports = {
  ...require('./db'),
  ...require('./auth'),
  ...require('./server'),
  ...require('./middleware'),
  ...require('./http'),
  ...require('./storage'),
  ...require('./events'),
  ...require('./kafka')
};
