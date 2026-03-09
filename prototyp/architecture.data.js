import core from './data/architecture/core.json';
import elements from './data/architecture/elements.json';
import flows from './data/architecture/flows.json';
import views from './data/architecture/views.json';
import governance from './data/architecture/governance.json';

export const ARCHITECTURE_DATA = {
  ...core,
  ...elements,
  ...flows,
  ...views,
  ...governance,
};

export const NODE_DIMENSIONS = {
  width: 220,
  height: 94,
};
