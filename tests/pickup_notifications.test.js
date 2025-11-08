const { start } = require('../services/pickupNotifications');

describe('pickupNotifications scheduler basic', () => {
  test('module loads and start() returns controller', () => {
    const ctrl = start();
    expect(ctrl).toBeTruthy();
    if (ctrl && ctrl.stop) ctrl.stop();
  });
});
