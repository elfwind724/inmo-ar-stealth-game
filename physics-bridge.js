import RAPIER from '@dimforge/rapier3d-compat';

let ready;
window.INMOPhysics = {
  load() {
    if (!ready) ready = RAPIER.init().then(() => RAPIER);
    return ready;
  }
};
