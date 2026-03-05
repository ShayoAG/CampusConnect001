import { ARCHITECTURE_DATA, NODE_DIMENSIONS } from './architecture.data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

class ArchitectureDashboard {
  constructor(data) {
    this.data = data;
    this.nodesById = new Map(data.nodes.map((node) => [node.id, node]));
    this.edgesById = new Map(data.edges.map((edge) => [edge.id, edge]));
    this.embeddedById = new Map((data.embeddedNodes || []).map((item) => [item.id, item]));
    this.scenariosById = new Map(data.scenarios.map((scenario) => [scenario.id, scenario]));
    this.ringsById = new Map(data.rings.map((ring) => [ring.id, ring]));
    this.nodeGroupById = this.createNodeGroupMap(data.groups || []);
    this.serviceNodeIds = new Set(data.serviceNodeIds || []);

    this.state = {
      scenario: 'overview',
      filter: 'all',
      showOptional: true,
      activeTab: 'info',
      selectedType: null,
      selectedId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDragging: false,
      lastPointer: { x: 0, y: 0 },
    };

    this.elements = {
      scenarioSelect: document.getElementById('scenario-select'),
      filterButtons: Array.from(document.querySelectorAll('[data-filter]')),
      optionalToggle: document.getElementById('optional-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      resetView: document.getElementById('reset-view'),
      scenarioDescription: document.getElementById('scenario-description'),
      svgWrap: document.getElementById('svg-wrap'),
      svg: document.getElementById('architecture-svg'),
      defs: document.getElementById('svg-defs'),
      viewport: document.getElementById('viewport'),
      ringsLayer: document.getElementById('rings-layer'),
      groupsLayer: document.getElementById('groups-layer'),
      edgesLayer: document.getElementById('edges-layer'),
      nodesLayer: document.getElementById('nodes-layer'),
      tooltip: document.getElementById('tooltip'),
      tabs: Array.from(document.querySelectorAll('[data-tab]')),
      inspectorTitle: document.getElementById('inspector-title'),
      inspectorSubtitle: document.getElementById('inspector-subtitle'),
      inspectorContent: document.getElementById('inspector-content'),
    };

    this.currentModel = null;

    this.init();
  }

  createNodeGroupMap(groups) {
    const map = new Map();
    groups.forEach((group) => {
      (group.nodeIds || []).forEach((nodeId) => {
        map.set(nodeId, group);
      });
    });
    return map;
  }

  init() {
    this.populateScenarioSelect();
    this.injectMarkers();
    this.bindControls();
    this.bindDiagramInteractions();
    this.bindInspectorInteractions();
    this.syncControls();
    this.fitToContent();
    this.render();
  }

  populateScenarioSelect() {
    const fragment = document.createDocumentFragment();
    this.data.scenarios.forEach((scenario) => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.label;
      fragment.appendChild(option);
    });

    this.elements.scenarioSelect.innerHTML = '';
    this.elements.scenarioSelect.appendChild(fragment);
  }

  injectMarkers() {
    this.elements.defs.innerHTML = '';
    this.elements.defs.appendChild(this.createMarker('arrow-pii', 'var(--ai-brand-magenta)'));
    this.elements.defs.appendChild(this.createMarker('arrow-non-pii', 'var(--ai-brand-green)'));
  }

  createMarker(id, color) {
    const marker = this.createSvgElement('marker', {
      id,
      markerWidth: 12,
      markerHeight: 12,
      refX: 10,
      refY: 6,
      orient: 'auto',
      markerUnits: 'strokeWidth',
      viewBox: '0 0 12 12',
    });
    const path = this.createSvgElement('path', {
      d: 'M 0 1 L 0 11 L 10 6 z',
      fill: color,
    });
    marker.appendChild(path);
    return marker;
  }

  bindControls() {
    this.elements.scenarioSelect.addEventListener('change', (event) => {
      this.state.scenario = event.target.value;
      this.render();
    });

    this.elements.filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.state.filter = button.dataset.filter;
        this.render();
      });
    });

    this.elements.optionalToggle.addEventListener('click', () => {
      this.state.showOptional = !this.state.showOptional;
      this.render();
    });

    this.elements.themeToggle.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'light';
      root.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
      this.syncControls();
      this.render();
    });

    this.elements.resetView.addEventListener('click', () => {
      this.state.selectedType = null;
      this.state.selectedId = null;
      this.state.activeTab = 'info';
      this.fitToContent();
      this.render();
    });

    this.elements.tabs.forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const nextTab = tabButton.dataset.tab;
        this.state.activeTab = nextTab;

        if (nextTab !== 'flows' && this.state.selectedType === 'edge') {
          this.state.selectedType = null;
          this.state.selectedId = null;
        }

        this.render();
      });
    });
  }

  bindDiagramInteractions() {
    this.elements.svg.addEventListener('wheel', (event) => {
      event.preventDefault();

      const prevZoom = this.state.zoom;
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      const nextZoom = this.clamp(prevZoom * factor, 0.45, 2.8);
      if (nextZoom === prevZoom) return;

      const point = this.clientToSvgPoint(event.clientX, event.clientY);
      const ratio = nextZoom / prevZoom;

      this.state.pan.x = point.x - (point.x - this.state.pan.x) * ratio;
      this.state.pan.y = point.y - (point.y - this.state.pan.y) * ratio;
      this.state.zoom = nextZoom;
      this.applyTransform();
    });

    this.elements.svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('[data-interactive="true"]')) return;

      this.state.isDragging = true;
      this.state.lastPointer = { x: event.clientX, y: event.clientY };
      this.elements.svgWrap.classList.add('is-dragging');
      this.hideTooltip();
    });

    this.elements.svg.addEventListener('click', (event) => {
      if (event.target.closest('[data-interactive="true"]')) return;
      if (this.state.selectedType || this.state.selectedId) {
        this.state.selectedType = null;
        this.state.selectedId = null;
        this.render();
      }
    });

    window.addEventListener('pointermove', (event) => {
      if (!this.state.isDragging) return;

      const rect = this.elements.svg.getBoundingClientRect();
      const scaleX = this.data.canvas.width / rect.width;
      const scaleY = this.data.canvas.height / rect.height;
      const dx = (event.clientX - this.state.lastPointer.x) * scaleX;
      const dy = (event.clientY - this.state.lastPointer.y) * scaleY;

      this.state.pan.x += dx;
      this.state.pan.y += dy;
      this.state.lastPointer = { x: event.clientX, y: event.clientY };
      this.applyTransform();
    });

    window.addEventListener('pointerup', () => {
      this.state.isDragging = false;
      this.elements.svgWrap.classList.remove('is-dragging');
    });
  }

  bindInspectorInteractions() {
    this.elements.inspectorContent.addEventListener('click', (event) => {
      const edgeButton = event.target.closest('[data-select-edge]');
      if (edgeButton) {
        this.selectEdge(edgeButton.dataset.selectEdge);
        return;
      }

      const embeddedButton = event.target.closest('[data-select-embedded]');
      if (embeddedButton) {
        this.selectEmbedded(embeddedButton.dataset.selectEmbedded);
        return;
      }

      const nodeButton = event.target.closest('[data-select-node]');
      if (nodeButton) {
        this.selectNode(nodeButton.dataset.selectNode);
      }
    });
  }

  syncControls() {
    this.elements.scenarioSelect.value = this.state.scenario;

    this.elements.filterButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.filter === this.state.filter);
    });

    this.elements.optionalToggle.setAttribute('aria-pressed', String(this.state.showOptional));
    this.elements.optionalToggle.textContent = `Optionale Services: ${this.state.showOptional ? 'an' : 'aus'}`;

    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    this.elements.themeToggle.textContent = `Theme: ${theme === 'light' ? 'Dark' : 'Light'}`;

    const currentScenario = this.getCurrentScenario();
    this.elements.scenarioDescription.textContent = currentScenario?.description || '';

    this.elements.tabs.forEach((tabButton) => {
      const isActive = tabButton.dataset.tab === this.state.activeTab;
      tabButton.classList.toggle('is-active', isActive);
      tabButton.setAttribute('aria-selected', String(isActive));
    });

    this.elements.svgWrap.classList.toggle('flows-visible', this.shouldShowDiagramFlows());
  }

  getCurrentScenario() {
    return this.scenariosById.get(this.state.scenario) || this.data.scenarios[0];
  }

  shouldShowDiagramFlows() {
    return this.state.activeTab === 'flows';
  }

  applyTransform() {
    this.elements.viewport.setAttribute(
      'transform',
      `translate(${this.state.pan.x} ${this.state.pan.y}) scale(${this.state.zoom})`
    );
  }

  fitToContent() {
    const model = this.buildRenderModel();
    const bounds = this.getContentBounds(model);
    const canvas = this.data.canvas;
    const margin = 24;
    const fitWidth = Math.max(220, canvas.width - margin * 2);
    const fitHeight = Math.max(220, canvas.height - margin * 2);
    const scaleX = fitWidth / bounds.width;
    const scaleY = fitHeight / bounds.height;
    const nextZoom = this.clamp(Math.min(scaleX, scaleY), 0.45, 2.2);

    const contentCenterX = bounds.minX + bounds.width / 2;
    const contentCenterY = bounds.minY + bounds.height / 2;

    this.state.zoom = nextZoom;
    this.state.pan.x = canvas.width / 2 - contentCenterX * nextZoom;
    this.state.pan.y = canvas.height / 2 - contentCenterY * nextZoom;
    this.applyTransform();
  }

  getContentBounds(model) {
    const { centerX, centerY } = this.data.canvas;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const extend = (x1, y1, x2, y2) => {
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    };

    const ringFitFactor = 0.86;
    const rings = model.rings?.length ? model.rings : this.data.rings;
    rings.forEach((ring) => {
      extend(
        centerX - ring.rx * ringFitFactor,
        centerY - ring.ry * ringFitFactor,
        centerX + ring.rx * ringFitFactor,
        centerY + ring.ry * ringFitFactor
      );
    });

    const groups = model.groups?.length ? model.groups : this.data.groups;
    groups.forEach((group) => {
      extend(group.x, group.y, group.x + group.width, group.y + group.height);
    });

    model.nodes.forEach((node) => {
      extend(node.bounds.x, node.bounds.y, node.bounds.x + node.bounds.width, node.bounds.y + node.bounds.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return { minX: 0, minY: 0, width: this.data.canvas.width, height: this.data.canvas.height };
    }

    const padding = 42;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      width: Math.max(220, maxX - minX),
      height: Math.max(220, maxY - minY),
    };
  }

  render() {
    const model = this.buildRenderModel();
    this.currentModel = model;

    this.validateSelection(model);

    this.clearLayer(this.elements.ringsLayer);
    this.clearLayer(this.elements.groupsLayer);
    this.clearLayer(this.elements.edgesLayer);
    this.clearLayer(this.elements.nodesLayer);

    this.renderRings(model);
    this.renderGroups(model);
    if (model.showFlows) {
      this.renderEdges(model);
    }
    this.renderNodes(model);
    this.syncControls();
    this.renderInspector();
  }

  buildRenderModel() {
    const scenario = this.getCurrentScenario();
    const scopedZoneIds = scenario.visibleZoneIds?.length ? new Set(scenario.visibleZoneIds) : null;
    const scopedGroupIds = scenario.visibleGroupIds?.length ? new Set(scenario.visibleGroupIds) : null;
    const scopedEdgeIds = scenario.visibleEdgeIds?.length ? new Set(scenario.visibleEdgeIds) : null;
    const scopedNodeIds = scenario.visibleNodeIds?.length
      ? new Set(scenario.visibleNodeIds)
      : scenario.strictNodeScope && scenario.nodeIds?.length
        ? new Set(scenario.nodeIds)
        : null;
    const ringOverrides = scenario.ringOverrides || {};
    const groupOverrides = scenario.groupOverrides || {};
    const nodeOverrides = scenario.nodeOverrides || {};

    const ringModels = this.data.rings
      .filter((ring) => !scopedZoneIds || scopedZoneIds.has(ring.id))
      .map((ring) => ({ ...ring, ...(ringOverrides[ring.id] || {}) }));

    const groupModels = this.data.groups
      .filter(
        (group) =>
          (!scopedZoneIds || scopedZoneIds.has(group.zone)) &&
          (!scopedGroupIds || scopedGroupIds.has(group.id))
      )
      .map((group) => ({ ...group, ...(groupOverrides[group.id] || {}) }));
    const groupByNode = this.createNodeGroupMap(groupModels);
    const ringById = new Map(ringModels.map((ring) => [ring.id, ring]));

    let visibleNodes = this.data.nodes.filter((node) => this.state.showOptional || !node.optional);
    if (scopedZoneIds) {
      visibleNodes = visibleNodes.filter((node) => scopedZoneIds.has(node.zone));
    }
    if (scopedNodeIds && scenario.strictNodeScope) {
      visibleNodes = visibleNodes.filter((node) => scopedNodeIds.has(node.id));
    }

    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    let baseEdges = this.data.edges.filter(
      (edge) => (this.state.showOptional || !edge.optional) && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
    if (scopedEdgeIds) {
      baseEdges = baseEdges.filter((edge) => scopedEdgeIds.has(edge.id));
    }

    const filteredEdges = baseEdges.filter((edge) => this.state.filter === 'all' || edge.dataClass === this.state.filter);
    const highlightedEdgeIds = new Set(scenario.edgeIds || []);
    const scenarioRelevantNodeIds = new Set(scenario.nodeIds || []);
    const scenarioDimmingEnabled = scenario.id !== 'overview' && !scenario.disableDimming;
    const shouldDimByScenario =
      scenarioDimmingEnabled &&
      (highlightedEdgeIds.size > 0 || scenarioRelevantNodeIds.size > 0);

    if (shouldDimByScenario) {
      filteredEdges.forEach((edge) => {
        if (highlightedEdgeIds.size === 0 || highlightedEdgeIds.has(edge.id)) {
          scenarioRelevantNodeIds.add(edge.source);
          scenarioRelevantNodeIds.add(edge.target);
        }
      });
    }

    const filteredRelevantNodes = new Set();
    filteredEdges.forEach((edge) => {
      filteredRelevantNodes.add(edge.source);
      filteredRelevantNodes.add(edge.target);
    });

    const nodeModels = visibleNodes.map((node) => {
      const nodeData = { ...node, ...(nodeOverrides[node.id] || {}) };
      const byFilter = this.isNodeRelevantForFilter(node, filteredRelevantNodes);
      const byScenario = !shouldDimByScenario || scenarioRelevantNodeIds.has(nodeData.id);
      return {
        ...nodeData,
        visualType: this.getNodeVisualType(nodeData),
        bounds: this.getNodeBounds(nodeData),
        zoneViolation: false,
        isDimmed: !byFilter || !byScenario,
      };
    });
    const resolvedNodes = this.resolveNodeOverlaps(nodeModels, groupByNode, ringById);

    const edgeModels = filteredEdges.map((edge) => ({
      ...edge,
      isDimmed: shouldDimByScenario && highlightedEdgeIds.size > 0 && !highlightedEdgeIds.has(edge.id),
      isHighlighted: !shouldDimByScenario || highlightedEdgeIds.size === 0 || highlightedEdgeIds.has(edge.id),
      isOptional: Boolean(edge.optional),
    }));

    const resolvedNodeIdSet = new Set(resolvedNodes.map((node) => node.id));
    const embeddedModels = (this.data.embeddedNodes || [])
      .filter((item) => {
        if (item.scenarios?.length && !item.scenarios.includes(scenario.id)) return false;
        if (!resolvedNodeIdSet.has(item.parentNodeId)) return false;
        if (scopedZoneIds && !scopedZoneIds.has(item.zone)) return false;
        return true;
      })
      .map((item) => ({
        ...item,
      }));
    const embeddedByParent = new Map();
    embeddedModels.forEach((item) => {
      const list = embeddedByParent.get(item.parentNodeId) || [];
      list.push(item);
      embeddedByParent.set(item.parentNodeId, list);
    });

    const zoneViolations = resolvedNodes.filter((node) => node.zoneViolation && !node.allowOutsideZone);

    return {
      scenario,
      scenarioActive: shouldDimByScenario,
      showFlows: this.shouldShowDiagramFlows(),
      rings: ringModels,
      groups: groupModels,
      nodes: resolvedNodes,
      edges: edgeModels,
      embeddedNodes: embeddedModels,
      embeddedByParent,
      zoneViolations,
      nodeIdSet: new Set(resolvedNodes.map((node) => node.id)),
      edgeIdSet: new Set(edgeModels.map((edge) => edge.id)),
      embeddedIdSet: new Set(embeddedModels.map((item) => item.id)),
    };
  }

  getNodeVisualType(node) {
    if (node.visualType) return node.visualType;
    if (this.serviceNodeIds.has(node.id) || node.externalCard) return 'service';
    return 'build';
  }

  resolveNodeOverlaps(nodes, groupByNode = this.nodeGroupById, ringById = this.ringsById) {
    const arranged = nodes.map((node) => ({
      ...node,
      bounds: { ...node.bounds },
    }));

    arranged.forEach((node) => {
      this.constrainNodeToGroup(node, groupByNode);
      this.constrainNodeToZone(node, ringById);
    });

    // Preserve manually curated layout across scenario switches.
    if (this.data.layout?.preserveManualPositions) {
      arranged.forEach((node) => {
        node.zoneViolation = !this.isNodeInsideZone(node, ringById);
      });
      return arranged;
    }

    const iterations = 72;
    const padding = 14;

    for (let step = 0; step < iterations; step += 1) {
      let moved = false;

      for (let i = 0; i < arranged.length; i += 1) {
        for (let j = i + 1; j < arranged.length; j += 1) {
          const a = arranged[i];
          const b = arranged[j];
          const delta = this.getOverlapSeparation(a, b, padding);
          if (!delta) continue;

          moved = true;
          this.shiftNodeBounds(a, -delta.dx / 2, -delta.dy / 2);
          this.shiftNodeBounds(b, delta.dx / 2, delta.dy / 2);
          this.constrainNodeToGroup(a, groupByNode);
          this.constrainNodeToGroup(b, groupByNode);
          this.constrainNodeToZone(a, ringById);
          this.constrainNodeToZone(b, ringById);
        }
      }

      if (!moved) break;
    }

    arranged.forEach((node) => {
      node.zoneViolation = !this.isNodeInsideZone(node, ringById);
    });

    return arranged;
  }

  getOverlapSeparation(nodeA, nodeB, padding) {
    const a = nodeA.bounds;
    const b = nodeB.bounds;

    const axCenter = a.x + a.width / 2;
    const ayCenter = a.y + a.height / 2;
    const bxCenter = b.x + b.width / 2;
    const byCenter = b.y + b.height / 2;
    const dx = bxCenter - axCenter;
    const dy = byCenter - ayCenter;

    const overlapX = a.width / 2 + b.width / 2 + padding - Math.abs(dx);
    const overlapY = a.height / 2 + b.height / 2 + padding - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return null;

    if (overlapX < overlapY) {
      const sign = dx === 0 ? (nodeA.id < nodeB.id ? -1 : 1) : Math.sign(dx);
      return { dx: overlapX * sign, dy: 0 };
    }

    const sign = dy === 0 ? (nodeA.id < nodeB.id ? -1 : 1) : Math.sign(dy);
    return { dx: 0, dy: overlapY * sign };
  }

  shiftNodeBounds(node, dx, dy) {
    node.bounds.x += dx;
    node.bounds.y += dy;
    node.bounds.cx = node.bounds.x + node.bounds.width / 2;
    node.bounds.cy = node.bounds.y + node.bounds.height / 2;
  }

  constrainNodeToGroup(node, groupByNode = this.nodeGroupById) {
    const group = groupByNode.get(node.id);
    if (!group) return;

    const paddingX = 10;
    const paddingYTop = 38;
    const paddingYBottom = 12;
    const maxX = group.x + group.width - node.bounds.width - paddingX;
    const maxY = group.y + group.height - node.bounds.height - paddingYBottom;

    node.bounds.x = this.clamp(node.bounds.x, group.x + paddingX, Math.max(group.x + paddingX, maxX));
    node.bounds.y = this.clamp(node.bounds.y, group.y + paddingYTop, Math.max(group.y + paddingYTop, maxY));
    node.bounds.cx = node.bounds.x + node.bounds.width / 2;
    node.bounds.cy = node.bounds.y + node.bounds.height / 2;
  }

  constrainNodeToZone(node, ringById = this.ringsById) {
    if (node.allowOutsideZone) return;
    const ring = ringById.get(node.zone);
    if (!ring) return;

    const margin = 12;
    const maxRx = ring.rx - node.bounds.width / 2 - margin;
    const maxRy = ring.ry - node.bounds.height / 2 - margin;
    if (maxRx <= 0 || maxRy <= 0) return;

    const centerX = this.data.canvas.centerX;
    const centerY = this.data.canvas.centerY;
    const dx = node.bounds.cx - centerX;
    const dy = node.bounds.cy - centerY;
    const norm = (dx * dx) / (maxRx * maxRx) + (dy * dy) / (maxRy * maxRy);

    if (norm <= 1) return;

    const factor = (1 / Math.sqrt(norm)) * 0.986;
    node.bounds.cx = centerX + dx * factor;
    node.bounds.cy = centerY + dy * factor;
    node.bounds.x = node.bounds.cx - node.bounds.width / 2;
    node.bounds.y = node.bounds.cy - node.bounds.height / 2;
  }

  isNodeInsideZone(node, ringById = this.ringsById) {
    const ring = ringById.get(node.zone);
    if (!ring) return true;

    const margin = 6;
    const maxRx = ring.rx - node.bounds.width / 2 - margin;
    const maxRy = ring.ry - node.bounds.height / 2 - margin;
    if (maxRx <= 0 || maxRy <= 0) return false;

    const dx = node.bounds.cx - this.data.canvas.centerX;
    const dy = node.bounds.cy - this.data.canvas.centerY;
    const norm = (dx * dx) / (maxRx * maxRx) + (dy * dy) / (maxRy * maxRy);
    return norm <= 1;
  }

  isNodeRelevantForFilter(node, filteredRelevantNodes) {
    if (this.state.filter === 'all') return true;
    if (filteredRelevantNodes.has(node.id)) return true;

    if (this.state.filter === 'pii') {
      return node.dataClass === 'pii' || node.dataClass === 'mixed';
    }

    return node.dataClass !== 'pii';
  }

  validateSelection(model) {
    if (!this.state.selectedType || !this.state.selectedId) return;

    const selectionMissing =
      (this.state.selectedType === 'node' && !model.nodeIdSet.has(this.state.selectedId)) ||
      (this.state.selectedType === 'edge' && !model.edgeIdSet.has(this.state.selectedId)) ||
      (this.state.selectedType === 'embedded' && !model.embeddedIdSet.has(this.state.selectedId));

    if (selectionMissing) {
      this.state.selectedType = null;
      this.state.selectedId = null;
    }
  }

  renderRings(model) {
    const { centerX, centerY } = this.data.canvas;
    const rings = model.rings?.length ? model.rings : this.data.rings;

    rings.forEach((ring) => {
      const ellipse = this.createSvgElement('ellipse', {
        class: `zone-ring ${ring.className}`,
        cx: centerX,
        cy: centerY,
        rx: ring.rx,
        ry: ring.ry,
      });
      this.elements.ringsLayer.appendChild(ellipse);

      const label = this.createSvgElement('text', {
        class: 'zone-label',
        x: centerX,
        y: centerY - ring.ry + ring.labelOffsetY,
      });
      label.textContent = ring.title;
      this.elements.ringsLayer.appendChild(label);
    });
  }

  renderGroups(model) {
    const groups = model.groups?.length ? model.groups : this.data.groups;
    groups.forEach((group) => {
      const wrapper = this.createSvgElement('g');

      wrapper.appendChild(
        this.createSvgElement('rect', {
          class: 'cluster-box',
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
        })
      );

      const titleLines = this.wrapGroupLabel(group.label, 32);
      titleLines.forEach((line, index) => {
        const title = this.createSvgElement('text', {
          class: 'cluster-title',
          x: group.x + 14,
          y: group.y + 22 + index * 13,
        });
        title.textContent = line;
        wrapper.appendChild(title);
      });

      this.elements.groupsLayer.appendChild(wrapper);
    });
  }

  renderEdges(model) {
    const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));

    model.edges.forEach((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const geometry = this.buildEdgeGeometry(sourceNode.bounds, targetNode.bounds);
      const isSelected = this.state.selectedType === 'edge' && this.state.selectedId === edge.id;

      const group = this.createSvgElement('g', {
        class: `edge-group ${edge.isDimmed ? 'is-dimmed' : ''} ${isSelected ? 'is-selected' : ''} ${edge.isOptional ? 'is-optional' : ''}`,
        'data-interactive': 'true',
      });

      const hitPath = this.createSvgElement('path', {
        class: 'edge-hit',
        d: geometry.path,
        tabindex: 0,
        role: 'button',
        'aria-label': `Datenfluss ${edge.label}: ${this.getNodeLabel(edge.source)} zu ${this.getNodeLabel(edge.target)}`,
        'data-interactive': 'true',
      });

      const visiblePath = this.createSvgElement('path', {
        class: `edge-path ${edge.dataClass} ${edge.style}`,
        d: geometry.path,
        'marker-end': `url(#arrow-${edge.dataClass === 'pii' ? 'pii' : 'non-pii'})`,
      });

      const label = this.createSvgElement('text', {
        class: 'edge-label',
        x: geometry.labelX,
        y: geometry.labelY,
      });
      label.textContent = edge.label;

      const bindSelect = (event) => {
        event.stopPropagation();
        this.selectEdge(edge.id);
      };

      hitPath.addEventListener('click', bindSelect);
      hitPath.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          bindSelect(event);
        }
      });

      hitPath.addEventListener('mouseenter', (event) => {
        this.showTooltip(`${edge.label} (${edge.dataClass.toUpperCase()})`, event.clientX, event.clientY);
      });
      hitPath.addEventListener('mousemove', (event) => {
        this.moveTooltip(event.clientX, event.clientY);
      });
      hitPath.addEventListener('mouseleave', () => this.hideTooltip());
      hitPath.addEventListener('focus', () => {
        this.showTooltipNearElement(`${edge.label} (${edge.dataClass.toUpperCase()})`, hitPath);
      });
      hitPath.addEventListener('blur', () => this.hideTooltip());

      group.appendChild(hitPath);
      group.appendChild(visiblePath);
      group.appendChild(label);
      this.elements.edgesLayer.appendChild(group);
    });
  }

  renderNodes(model) {
    model.nodes.forEach((node) => {
      const isSelected = this.state.selectedType === 'node' && this.state.selectedId === node.id;
      const zoneTitle = this.getZoneTitle(node.zone);
      const lines = this.wrapNodeLabel(node.displayLabel || node.label, 20);
      const isServiceNode = node.visualType === 'service';
      const isPlatformNode = node.visualType === 'platform';
      const nodeRoleClass = isPlatformNode ? 'is-platform' : isServiceNode ? 'is-service' : 'is-build';
      const nodeRadius = isServiceNode ? 34 : isPlatformNode ? 20 : 16;

      const group = this.createSvgElement('g', {
        class: `node-group ${nodeRoleClass} ${node.isDimmed ? 'is-dimmed' : ''} ${isSelected ? 'is-selected' : ''} ${node.optional ? 'is-optional' : ''} ${node.externalCard ? 'is-external' : ''} ${node.zoneViolation ? 'is-zone-violation' : ''}`,
        transform: `translate(${node.bounds.x} ${node.bounds.y})`,
        tabindex: 0,
        role: 'button',
        'aria-label': `Komponente ${node.label}, Zone ${zoneTitle}, Datenklasse ${this.formatDataClass(node.dataClass)}`,
        'data-interactive': 'true',
        'data-data-class': node.dataClass,
      });

      group.appendChild(
        this.createSvgElement('rect', {
          class: 'node-rect',
          width: node.bounds.width,
          height: node.bounds.height,
          rx: nodeRadius,
          ry: nodeRadius,
        })
      );

      if (isPlatformNode) {
        // Platform cards show custom inner structure instead of class strip/dot.
      } else if (!isServiceNode) {
        group.appendChild(
          this.createSvgElement('rect', {
            class: `node-class-strip ${node.dataClass}`,
            x: 0,
            y: 0,
            width: 6,
            height: node.bounds.height,
          })
        );
      } else if (!node.hideServiceMarker) {
        group.appendChild(
          this.createSvgElement('circle', {
            class: `node-service-dot ${node.dataClass}`,
            cx: node.bounds.width - 18,
            cy: 18,
            r: 8,
          })
        );
        const marker = this.createSvgElement('text', {
          class: 'node-service-mark',
          x: node.bounds.width - 18,
          y: 21.5,
        });
        marker.textContent = 'S';
        group.appendChild(marker);
      }

      if (node.renderKind === 'moodle-shell') {
        this.renderMoodleShellNode(group, node, model);
      } else if (node.logoSrc) {
        this.renderLogoNode(group, node);
      } else {
        const lineStartY = lines.length === 1 ? 42 : 32;
        lines.forEach((line, index) => {
          const title = this.createSvgElement('text', {
            class: 'node-title',
            x: isServiceNode ? 18 : 15,
            y: lineStartY + index * 18,
          });
          title.textContent = line;
          group.appendChild(title);
        });

        const subtitleY = lineStartY + lines.length * 18 + 8;

        if (node.icon) {
          const icon = this.createSvgElement('text', {
            class: 'node-icon',
            x: node.bounds.width - 30,
            y: 24,
          });
          icon.textContent = node.icon;
          group.appendChild(icon);
        }

        if (node.logoBadges && node.logoBadges.length) {
          this.renderProviderBadges(group, node);
        }
      }

      const selectNode = (event) => {
        event.stopPropagation();
        this.selectNode(node.id);
      };

      group.addEventListener('click', selectNode);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectNode(event);
        }
      });

      group.addEventListener('mouseenter', (event) => {
        this.showTooltip(node.shortDescription, event.clientX, event.clientY);
      });
      group.addEventListener('mousemove', (event) => {
        this.moveTooltip(event.clientX, event.clientY);
      });
      group.addEventListener('mouseleave', () => this.hideTooltip());
      group.addEventListener('focus', () => this.showTooltipNearElement(node.shortDescription, group));
      group.addEventListener('blur', () => this.hideTooltip());

      this.elements.nodesLayer.appendChild(group);
    });
  }

  renderInspector() {
    const selected = this.getSelectedEntity();

    if (!selected) {
      this.elements.inspectorTitle.textContent = 'Inspector';
      this.elements.inspectorSubtitle.textContent = 'Klicke eine Komponente oder einen Datenfluss.';
      this.elements.inspectorContent.innerHTML = this.renderInspectorEmpty();
      this.syncControls();
      return;
    }

    if (selected.type === 'node' || selected.type === 'embedded') {
      this.renderNodeInspector(selected.entity);
    } else {
      this.renderEdgeInspector(selected.entity);
    }

    this.syncControls();
  }

  renderInspectorEmpty() {
    const scenario = this.getCurrentScenario();
    return `
      <section class="inspector-empty">
        <p><strong>Story-Modus:</strong> ${this.escapeHtml(scenario.label)}</p>
        <p>${this.escapeHtml(scenario.description)}</p>
        <ul>
          <li>1 Klick auf Baustein: Zweck, Datenklasse, Zone und Sicherheitsnotizen.</li>
          <li>Tab "Datenflüsse" blendet Pfeile ein; Info/Sicherheit blendet sie aus.</li>
          <li>Filter "Nur PII" zeigt nur magenta Flows und relevante Komponenten.</li>
          <li>"Optionale Services: aus" blendet externe optionale Knoten/Edges aus.</li>
        </ul>
      </section>
      ${this.renderStorylineSection()}
      ${this.renderVisualGuideSection()}
      ${this.renderZoneComplianceSection()}
      ${this.renderSecurityPrinciplesSection()}
      ${this.renderApMappingSection()}
      ${this.renderDemoFaqSection()}
    `;
  }

  renderNodeInspector(node) {
    this.elements.inspectorTitle.textContent = node.label;
    this.elements.inspectorSubtitle.textContent = '';

    if (this.state.activeTab === 'info') {
      this.elements.inspectorContent.innerHTML = this.renderNodeInfoTab(node);
      return;
    }

    if (this.state.activeTab === 'flows') {
      this.elements.inspectorContent.innerHTML = this.renderNodeFlowsTab(node);
      return;
    }

    this.elements.inspectorContent.innerHTML = this.renderNodeSecurityTab(node);
  }

  renderEdgeInspector(edge) {
    this.elements.inspectorTitle.textContent = edge.label;
    this.elements.inspectorSubtitle.textContent = '';

    if (this.state.activeTab === 'info') {
      this.elements.inspectorContent.innerHTML = this.renderEdgeInfoTab(edge);
      return;
    }

    if (this.state.activeTab === 'flows') {
      this.elements.inspectorContent.innerHTML = this.renderEdgeFlowsTab(edge);
      return;
    }

    this.elements.inspectorContent.innerHTML = this.renderEdgeSecurityTab(edge);
  }

  renderNodeInfoTab(node) {
    const visualType = this.getNodeVisualType(node);
    const nodeTypeLabel =
      visualType === 'service'
        ? 'Genutzter Service'
        : visualType === 'platform'
          ? 'Bestehendes Plattformsystem'
          : 'Zu entwickelnder Baustein';

    return `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Zone</span>
          <span>${this.escapeHtml(this.getZoneTitle(node.zone))}</span>
        </div>
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(node.dataClass)}</span>
        </div>
      </section>

      <section class="section">
        <h3>Baustein-Typ</h3>
        <p>${nodeTypeLabel}</p>
      </section>

      <section class="section">
        <h3>Was ist das?</h3>
        <p>${this.escapeHtml(node.shortDescription)}</p>
      </section>

      <section class="section">
        <h3>Wozu dient es?</h3>
        ${this.renderList(node.purpose || node.longDescription || [])}
      </section>

      <section class="section">
        <h3>Input</h3>
        ${this.renderList(node.inputs || [])}
      </section>

      <section class="section">
        <h3>Output</h3>
        ${this.renderList(node.outputs || [])}
      </section>

      ${node.apMapping ? `<section class="section"><h3>RWTH Mapping</h3><p>${this.escapeHtml(node.apMapping)}</p></section>` : ''}
    `;
  }

  renderNodeFlowsTab(node) {
    const edges = this.currentModel ? this.currentModel.edges : [];
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);

    const section = (title, list) => {
      if (!list.length) {
        return `
          <section class="section">
            <h3>${title}</h3>
            <p>Keine aktiven Datenflüsse im aktuellen Filter/Szenario.</p>
          </section>
        `;
      }

      return `
        <section class="section">
          <h3>${title}</h3>
          <ul class="flow-list">
            ${list
              .map(
                (edge) => `
              <li class="flow-item">
                <div class="flow-main">
                  <span>${this.escapeHtml(edge.label)}</span>
                  ${this.dataBadge(edge.dataClass)}
                </div>
                <div class="flow-route">${this.escapeHtml(this.getNodeLabel(edge.source))} → ${this.escapeHtml(this.getNodeLabel(edge.target))}</div>
                <button type="button" class="flow-select" data-select-edge="${edge.id}">Im Inspector öffnen</button>
              </li>
            `
              )
              .join('')}
          </ul>
        </section>
      `;
    };

    return `${section('Eingehende Flüsse', incoming)}${section('Ausgehende Flüsse', outgoing)}`;
  }

  renderNodeSecurityTab(node) {
    const renderedNode = this.getRenderedNode(node.id);
    const zoneCheckOk = renderedNode ? !renderedNode.zoneViolation : true;

    return `
      <section class="section">
        <h3>Zoneneinhaltung</h3>
        <p>${zoneCheckOk ? 'Erfuellt: Die Komponente liegt innerhalb ihrer Sicherheitszone.' : 'Pruefen: Diese Komponente liegt aktuell ausserhalb ihrer Zone und sollte neu positioniert werden.'}</p>
      </section>
      <section class="section">
        <h3>Sicherheitsnotizen</h3>
        ${this.renderList(node.securityNotes || [])}
      </section>
      ${this.renderZoneComplianceSection()}
      ${this.renderSecurityPrinciplesSection()}
      ${this.renderApMappingSection()}
      ${node.faq && node.faq.length ? this.renderFaqItems(node.faq) : this.renderDemoFaqSection()}
    `;
  }

  renderEdgeInfoTab(edge) {
    const source = this.getNodeLabel(edge.source);
    const target = this.getNodeLabel(edge.target);

    return `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(edge.dataClass)}</span>
        </div>
        <div class="meta-item">
          <span>Optional</span>
          <span>${edge.optional ? 'Ja' : 'Nein'}</span>
        </div>
      </section>

      <section class="section">
        <h3>Verbindung</h3>
        <p>${this.escapeHtml(source)} → ${this.escapeHtml(target)}</p>
      </section>

      <section class="section">
        <h3>Welche Daten?</h3>
        <p>${edge.dataClass === 'pii' ? 'Personenbezogene Lernsignale (PII).' : 'Nicht-personenbezogene Daten (non-PII).'}</p>
      </section>

      <section class="section">
        <h3>Warum so?</h3>
        <p>${this.escapeHtml(edge.why)}</p>
      </section>
    `;
  }

  renderEdgeFlowsTab(edge) {
    const source = this.nodesById.get(edge.source);
    const target = this.nodesById.get(edge.target);

    return `
      <section class="section">
        <h3>Datenfluss</h3>
        <ul class="flow-list">
          <li class="flow-item">
            <div class="flow-main">
              <span>${this.escapeHtml(edge.label)}</span>
              ${this.dataBadge(edge.dataClass)}
            </div>
            <div class="flow-route">${this.escapeHtml(this.getNodeLabel(edge.source))} → ${this.escapeHtml(this.getNodeLabel(edge.target))}</div>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Quelle / Ziel</h3>
        <ul class="flow-list">
          <li class="flow-item">
            <div class="flow-main"><span>Quelle</span></div>
            <div class="flow-route">${this.escapeHtml(source.label)}</div>
            <button type="button" class="flow-select" data-select-node="${source.id}">Quelle öffnen</button>
          </li>
          <li class="flow-item">
            <div class="flow-main"><span>Ziel</span></div>
            <div class="flow-route">${this.escapeHtml(target.label)}</div>
            <button type="button" class="flow-select" data-select-node="${target.id}">Ziel öffnen</button>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Policy & Logging</h3>
        <p>${this.escapeHtml(edge.policyHint)}</p>
      </section>
    `;
  }

  renderEdgeSecurityTab(edge) {
    return `
      <section class="section">
        <h3>Warum erlaubt / nicht erlaubt?</h3>
        <p>${this.escapeHtml(edge.why)}</p>
      </section>

      <section class="section">
        <h3>Policy Hinweis</h3>
        <p>${this.escapeHtml(edge.policyHint)}</p>
      </section>

      ${this.renderZoneComplianceSection()}
      ${this.renderSecurityPrinciplesSection()}
      ${this.renderApMappingSection()}
      ${this.renderDemoFaqSection()}
    `;
  }

  renderZoneComplianceSection() {
    const violations = this.currentModel?.zoneViolations || [];
    if (!violations.length) {
      return `
        <section class="section">
          <h3>Zonen-Compliance</h3>
          <p>Alle sichtbaren Komponenten liegen innerhalb ihrer zugewiesenen Sicherheitszone.</p>
        </section>
      `;
    }

    return `
      <section class="section">
        <h3>Zonen-Compliance</h3>
        <p>Folgende Komponenten liegen aktuell ausserhalb ihrer Zone:</p>
        <ul>
          ${violations
            .map(
              (node) =>
                `<li>${this.escapeHtml(node.label)} (${this.escapeHtml(this.getZoneTitle(node.zone))})</li>`
            )
            .join('')}
        </ul>
      </section>
    `;
  }

  renderStorylineSection() {
    const steps = this.getScenarioStorySteps(this.getCurrentScenario().id);
    return `
      <section class="section">
        <h3>In 3 Schritten erklaert</h3>
        <ol class="story-steps">
          ${steps.map((step) => `<li>${this.escapeHtml(step)}</li>`).join('')}
        </ol>
      </section>
    `;
  }

  getScenarioStorySteps(scenarioId) {
    switch (scenarioId) {
      case 'roadmap-1-sdg':
        return [
          'Wir starten mit Moodle LMS als bestehendem Kernsystem.',
          'Im Moodle-Kasten wird das LTI Interface entwickelt.',
          'Darauf basieren zwei Oberflaechen: Course UI und Author UI.',
        ];
      case 'roadmap-2-onprem':
        return [
          'Danach erweitern wir lokal in der On-Prem Zone um zwei neue Server-Bloecke.',
          'Content & Information Core Database Server sichert Datenhoheit und Governance.',
          'KI-Capabilitie Server liefert Authoring, Insights, Pathways und Companion.',
        ];
      case 'roadmap-3-de':
        return [
          'Als naechsten Schritt wird ein DE-Region Gateway (OpenAI Germany via SAP-Service) optional zugeschaltet.',
          'Dieses Gateway bedient nur spezialisierte KI-Aufrufe.',
          'Dabei werden nur non-PII Daten weitergegeben und alle Aufrufe geloggt.',
        ];
      case 'roadmap-4-eu':
        return [
          'Danach folgen optionale EU-Services fuer Lokalisierung und Sprachmediation.',
          'Diese erweitern Mehrsprachigkeit, ohne den Kern lokal zu verlassen.',
          'Auch hier bleibt der Zugriff policy-gesteuert und non-PII.',
        ];
      case 'roadmap-5-global':
        return [
          'Zuletzt koennen weitere spezialisierte US/Global Services genutzt werden.',
          'Beispiele sind Bild/Video-Ideen, Transkription oder Modellinferenz.',
          'Der Sicherheitsgrundsatz bleibt unveraendert: extern nur non-PII.',
        ];
      case 'authoring':
      case 'ap-208':
        return [
          'Lehrende erstellen Inhalte im Authoring Studio.',
          'Inhalte werden im Content Core versioniert und qualitaetsgesichert.',
          'Freigegebene Kurse werden in Moodle bereitgestellt.',
        ];
      case 'learning-tracking':
      case 'ap-204':
        return [
          'Studierende lernen in der Course UI im SDG-Campus.',
          'Lernaktivitaeten gehen als PII nur ins lokale LRS.',
          'Insights werden lokal berechnet und fuer Feedback genutzt.',
        ];
      case 'tutor-pathway':
      case 'ap-203':
      case 'ap-205':
        return [
          'Companion und Pathway nutzen Inhalte und Lernsignale.',
          'Policy Engine prueft jeden KI-Aufruf vor der Weitergabe.',
          'Externe Dienste erhalten nur freigegebene non-PII Daten.',
        ];
      case 'translation':
      case 'ap-206':
        return [
          'Content kann optional als Batch lokalisiert werden.',
          'Tutor-Antworten koennen optional in Echtzeit vermittelt werden.',
          'Auch hier gilt: extern nur non-PII, policy-geprueft.',
        ];
      case 'ap-202':
      case 'ap-209':
        return [
          'Policy, Audit und HITL bilden den Governance-Rahmen.',
          'PII bleibt in der lokalen Zone mit Datenhoheit.',
          'Rechtskonformitaet wird ueber Logging und Freigaben nachgewiesen.',
        ];
      default:
        return [
          'Kurse werden erstellt, freigegeben und in Moodle eingebunden.',
          'Studierende nutzen Kurse; Lerndaten bleiben lokal in DE/on-prem.',
          'Personalisierung und Tutor arbeiten policy-gesteuert mit optionalen externen Services.',
        ];
    }
  }

  renderVisualGuideSection() {
    return `
      <section class="section">
        <h3>Leseschluessel</h3>
        <ul>
          <li>Plattform-Karte = bestehendes Kernsystem (z. B. Moodle).</li>
          <li>Rechteck = zu entwickelnder Projektbaustein.</li>
          <li>Pill-Karte = genutzter Service (bestehend/extern).</li>
          <li>Magenta Linie = PII, nur lokal. Gruen Linie = non-PII.</li>
          <li>Gestrichelt = optionaler externer Pfad.</li>
        </ul>
      </section>
    `;
  }

  renderSecurityPrinciplesSection() {
    return `
      <section class="section">
        <h3>Warum ist das sicher?</h3>
        ${this.renderList(this.data.securityPrinciples)}
      </section>
    `;
  }

  renderApMappingSection() {
    if (!this.data.apMappingSummary || !this.data.apMappingSummary.length) return '';
    return `
      <section class="section">
        <details class="detail-block">
          <summary>AP-Mapping (RWTH)</summary>
          <ul class="flow-list">
            ${this.data.apMappingSummary
              .map(
                (entry) => `
              <li class="flow-item">
                <div class="flow-main"><span>AP ${this.escapeHtml(entry.ap)}</span></div>
                <div class="flow-route"><strong>${this.escapeHtml(entry.focus)}:</strong> ${this.escapeHtml(entry.components)}</div>
              </li>
            `
              )
              .join('')}
          </ul>
        </details>
      </section>
    `;
  }

  renderDemoFaqSection() {
    return this.renderFaqItems(this.data.demoFaq);
  }

  renderFaqItems(items) {
    return `
      <section class="section">
        <details class="detail-block">
          <summary>Demo Q&A</summary>
          ${items
            .map(
              (item) => `
            <article class="faq-item">
              <p>${this.escapeHtml(item.q)}</p>
              <p>${this.escapeHtml(item.a)}</p>
            </article>
          `
            )
            .join('')}
        </details>
      </section>
    `;
  }

  selectNode(nodeId) {
    this.state.selectedType = 'node';
    this.state.selectedId = nodeId;
    this.render();
  }

  selectEmbedded(embeddedId) {
    this.state.selectedType = 'embedded';
    this.state.selectedId = embeddedId;
    this.render();
  }

  selectEdge(edgeId) {
    this.state.selectedType = 'edge';
    this.state.selectedId = edgeId;
    this.render();
  }

  getSelectedEntity() {
    if (!this.state.selectedType || !this.state.selectedId) return null;

    if (this.state.selectedType === 'node') {
      const node = this.nodesById.get(this.state.selectedId);
      return node ? { type: 'node', entity: node } : null;
    }

    if (this.state.selectedType === 'embedded') {
      const embedded = this.embeddedById.get(this.state.selectedId);
      return embedded ? { type: 'embedded', entity: embedded } : null;
    }

    const edge = this.edgesById.get(this.state.selectedId);
    return edge ? { type: 'edge', entity: edge } : null;
  }

  getRenderedNode(nodeId) {
    return this.currentModel?.nodes.find((node) => node.id === nodeId) || null;
  }

  getNodeBounds(node) {
    const width = node.width || NODE_DIMENSIONS.width;
    const height = node.height || NODE_DIMENSIONS.height;
    return {
      x: node.x,
      y: node.y,
      width,
      height,
      cx: node.x + width / 2,
      cy: node.y + height / 2,
    };
  }

  buildEdgeGeometry(source, target) {
    const dx = target.cx - source.cx;
    const dy = target.cy - source.cy;

    let sx;
    let sy;
    let tx;
    let ty;

    if (Math.abs(dx) > Math.abs(dy)) {
      sx = dx >= 0 ? source.x + source.width : source.x;
      sy = source.cy;
      tx = dx >= 0 ? target.x : target.x + target.width;
      ty = target.cy;
    } else {
      sx = source.cx;
      sy = dy >= 0 ? source.y + source.height : source.y;
      tx = target.cx;
      ty = dy >= 0 ? target.y : target.y + target.height;
    }

    const horizontalCurve = Math.max(65, Math.abs(tx - sx) * 0.35);
    const verticalCurve = Math.max(65, Math.abs(ty - sy) * 0.35);

    const c1x = Math.abs(dx) > Math.abs(dy) ? sx + (dx >= 0 ? horizontalCurve : -horizontalCurve) : sx;
    const c1y = Math.abs(dx) > Math.abs(dy) ? sy : sy + (dy >= 0 ? verticalCurve : -verticalCurve);
    const c2x = Math.abs(dx) > Math.abs(dy) ? tx - (dx >= 0 ? horizontalCurve : -horizontalCurve) : tx;
    const c2y = Math.abs(dx) > Math.abs(dy) ? ty : ty - (dy >= 0 ? verticalCurve : -verticalCurve);

    const path = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
    const midpoint = this.bezierPoint(0.5, { x: sx, y: sy }, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: tx, y: ty });

    return {
      path,
      labelX: midpoint.x,
      labelY: midpoint.y - 8,
    };
  }

  bezierPoint(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return {
      x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
      y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
    };
  }

  renderMoodleShellNode(group, node, model) {
    const embeddedItems = model.embeddedByParent?.get(node.id) || [];
    const embeddedById = new Map(embeddedItems.map((item) => [item.id, item]));
    const padX = 16;
    const top = 16;

    const title = this.createSvgElement('text', {
      class: 'node-platform-title',
      x: padX,
      y: top + 8,
    });
    title.textContent = 'Moodle LMS (bestehend)';
    group.appendChild(title);

    const logoWidth = Math.min(206, node.bounds.width - padX * 2);
    const logoHeight = 54;
    const logoX = (node.bounds.width - logoWidth) / 2;
    const logoY = top + 24;
    const logo = this.createSvgElement('image', {
      class: 'moodle-logo',
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
      preserveAspectRatio: 'xMidYMid meet',
      href: node.logoSrc || 'assets/moodle-logo.svg',
    });
    group.appendChild(logo);

    const ltiX = padX;
    const ltiY = logoY + logoHeight + 10;
    const ltiWidth = node.bounds.width - padX * 2;
    const ltiHeight = Math.max(120, node.bounds.height - ltiY - 16);

    const ltiItem = embeddedById.get('embedded-ai-interface');
    const ltiGroup = this.createEmbeddedInteractiveGroup(
      ltiItem,
      'AI Interface (LTI)',
      'LTI-basierte Integrationsschicht fuer KI-Funktionen im Moodle-Kontext.'
    );
    ltiGroup.appendChild(
      this.createSvgElement('rect', {
        class: 'node-inner-lti',
        x: ltiX,
        y: ltiY,
        width: ltiWidth,
        height: ltiHeight,
        rx: 14,
        ry: 14,
      })
    );

    const ltiTitle = this.createSvgElement('text', {
      class: 'node-inner-title',
      x: ltiX + ltiWidth / 2,
      y: ltiY + 23,
    });
    ltiTitle.textContent = 'AI Interface (LTI)';
    ltiGroup.appendChild(ltiTitle);
    group.appendChild(ltiGroup);

    const badgeInnerPad = 10;
    const badgeWidth = ltiWidth - badgeInnerPad * 2;
    const badgeHeight = 30;
    const badgeGap = 8;
    const firstBadgeY = ltiY + 30;
    const badges = [
      { id: 'embedded-course-ui', label: 'Course UI', className: 'course' },
      { id: 'embedded-author-ui', label: 'Author UI', className: 'author' },
    ];

    badges.forEach((badge, index) => {
      const badgeX = ltiX + badgeInnerPad;
      const badgeY = firstBadgeY + index * (badgeHeight + badgeGap);
      const item = embeddedById.get(badge.id);
      const badgeGroup = this.createEmbeddedInteractiveGroup(
        item,
        badge.label,
        `${badge.label} im Moodle/LTI-Kontext.`
      );
      badgeGroup.appendChild(
        this.createSvgElement('rect', {
          class: `node-ui-badge ${badge.className}`,
          x: badgeX,
          y: badgeY,
          width: badgeWidth,
          height: badgeHeight,
          rx: 9,
          ry: 9,
        })
      );

      const badgeText = this.createSvgElement('text', {
        class: 'node-ui-badge-text',
        x: badgeX + badgeWidth / 2,
        y: badgeY + 19.2,
      });
      badgeText.textContent = badge.label;
      badgeGroup.appendChild(badgeText);
      group.appendChild(badgeGroup);
    });
  }

  createEmbeddedInteractiveGroup(item, fallbackLabel, fallbackTooltip) {
    const hasEntity = Boolean(item?.id);
    const isSelected = hasEntity && this.state.selectedType === 'embedded' && this.state.selectedId === item.id;
    const wrapper = this.createSvgElement('g', {
      class: `embedded-item ${isSelected ? 'is-selected' : ''}`,
      'data-interactive': 'true',
    });

    if (!hasEntity) {
      return wrapper;
    }

    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute(
      'aria-label',
      `${item.label || fallbackLabel}, ${this.formatDataClass(item.dataClass || 'system')}`
    );

    const select = (event) => {
      event.stopPropagation();
      this.selectEmbedded(item.id);
    };

    wrapper.addEventListener('click', select);
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(event);
      }
    });

    const tooltipText = item.shortDescription || fallbackTooltip || fallbackLabel;
    wrapper.addEventListener('mouseenter', (event) => {
      this.showTooltip(tooltipText, event.clientX, event.clientY);
    });
    wrapper.addEventListener('mousemove', (event) => {
      this.moveTooltip(event.clientX, event.clientY);
    });
    wrapper.addEventListener('mouseleave', () => this.hideTooltip());
    wrapper.addEventListener('focus', () => this.showTooltipNearElement(tooltipText, wrapper));
    wrapper.addEventListener('blur', () => this.hideTooltip());

    return wrapper;
  }

  renderProviderBadges(group, node) {
    const badges = node.logoBadges.slice(0, 4);
    const cols = 2;
    const gapX = 7;
    const gapY = 5;
    const left = 12;
    const pillHeight = 16;
    const pillWidth = Math.max(80, Math.floor((node.bounds.width - left * 2 - gapX) / 2));
    const rows = Math.ceil(badges.length / cols);
    const startY = node.bounds.height - rows * pillHeight - (rows - 1) * gapY - 10;

    badges.forEach((badge, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = left + col * (pillWidth + gapX);
      const y = startY + row * (pillHeight + gapY);

      group.appendChild(
        this.createSvgElement('rect', {
          class: 'provider-pill',
          x,
          y,
          width: pillWidth,
          height: pillHeight,
          rx: 8,
          ry: 8,
        })
      );

      const label = this.createSvgElement('text', {
        class: 'provider-pill-text',
        x: x + pillWidth / 2,
        y: y + 11.2,
      });
      label.textContent = badge;
      group.appendChild(label);
    });
  }

  renderLogoNode(group, node) {
    const titleText = node.logoTitle || node.displayLabel || node.label;
    const showTitle = node.showLogoTitle !== false && Boolean(titleText);
    let contentTop = 10;

    if (showTitle) {
      const title = this.createSvgElement('text', {
        class: 'node-title',
        x: node.bounds.width / 2,
        y: 24,
        'text-anchor': 'middle',
      });
      title.textContent = titleText;
      group.appendChild(title);
      contentTop = 30;
    }

    const maxWidth = node.bounds.width - 20;
    const maxHeight = Math.max(20, node.bounds.height - contentTop - 10);
    const logoWidth = Math.min(node.logoWidth || 120, maxWidth);
    const logoHeight = Math.min(node.logoHeight || 26, maxHeight);
    const x = (node.bounds.width - logoWidth) / 2;
    const y = contentTop + Math.max(0, (maxHeight - logoHeight) / 2);

    group.appendChild(
      this.createSvgElement('image', {
        class: 'node-provider-logo',
        x,
        y,
        width: logoWidth,
        height: logoHeight,
        preserveAspectRatio: 'xMidYMid meet',
        href: node.logoSrc,
      })
    );

    if (node.logoTag) {
      const tag = this.createSvgElement('text', {
        class: 'node-logo-tag',
        x: Math.min(node.bounds.width - 8, x + logoWidth + 4),
        y: y + logoHeight - 2,
      });
      tag.textContent = node.logoTag;
      group.appendChild(tag);
    }
  }

  wrapNodeLabel(label, maxCharsPerLine) {
    if (label.length <= maxCharsPerLine) return [label];

    const words = label.split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine || lines.length === 1) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    if (lines.length > 2) {
      const first = lines[0];
      const second = `${lines.slice(1).join(' ').slice(0, maxCharsPerLine - 1)}…`;
      return [first, second];
    }

    return lines;
  }

  wrapGroupLabel(label, maxCharsPerLine) {
    if (label.length <= maxCharsPerLine) return [label];

    const words = label.split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine || lines.length >= 2) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  getZoneTitle(zoneId) {
    const zone = this.data.zones.find((item) => item.id === zoneId);
    return zone ? zone.title : zoneId;
  }

  getNodeLabel(nodeId) {
    return this.nodesById.get(nodeId)?.label || nodeId;
  }

  dataBadge(dataClass) {
    return `<span class="data-badge ${dataClass}">${this.escapeHtml(this.formatDataClass(dataClass))}</span>`;
  }

  formatDataClass(dataClass) {
    switch (dataClass) {
      case 'pii':
        return 'PII';
      case 'non-pii':
        return 'non-PII';
      case 'mixed':
        return 'mixed';
      case 'system':
        return 'system';
      default:
        return dataClass;
    }
  }

  renderList(items) {
    if (!items || !items.length) return '<p>Keine Angaben.</p>';
    return `<ul>${items.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  clientToSvgPoint(clientX, clientY) {
    const rect = this.elements.svg.getBoundingClientRect();
    const viewBox = this.elements.svg.viewBox.baseVal;

    const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width;
    const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height;
    return { x, y };
  }

  showTooltip(text, clientX, clientY) {
    if (!text) return;
    this.elements.tooltip.textContent = text;
    this.elements.tooltip.classList.add('is-visible');
    this.elements.tooltip.setAttribute('aria-hidden', 'false');
    this.moveTooltip(clientX, clientY);
  }

  showTooltipNearElement(text, element) {
    const rect = element.getBoundingClientRect();
    this.showTooltip(text, rect.left + rect.width / 2, rect.top + 6);
  }

  moveTooltip(clientX, clientY) {
    const parentRect = this.elements.svgWrap.getBoundingClientRect();
    const tooltipRect = this.elements.tooltip.getBoundingClientRect();

    let left = clientX - parentRect.left + 14;
    let top = clientY - parentRect.top + 14;

    if (left + tooltipRect.width > parentRect.width - 12) {
      left = parentRect.width - tooltipRect.width - 12;
    }

    if (top + tooltipRect.height > parentRect.height - 12) {
      top = parentRect.height - tooltipRect.height - 12;
    }

    if (left < 8) left = 8;
    if (top < 8) top = 8;

    this.elements.tooltip.style.left = `${left}px`;
    this.elements.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.elements.tooltip.classList.remove('is-visible');
    this.elements.tooltip.setAttribute('aria-hidden', 'true');
  }

  clearLayer(layer) {
    layer.textContent = '';
  }

  createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArchitectureDashboard(ARCHITECTURE_DATA);
});
