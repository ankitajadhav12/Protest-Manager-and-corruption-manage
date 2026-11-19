document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('pcm-leaflet-map');
  if (!mapEl) return;

  const map = L.map(mapEl).setView([18.5204, 73.8567], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  const eventLayer = L.layerGroup().addTo(map);
  const hotspotLayer = L.layerGroup().addTo(map);
  const complaintLayer = L.layerGroup().addTo(map);

  async function refreshLayers() {
    const [ev, hs, cmp] = await Promise.all([
      fetch('/api/map/events').then((r) => r.json()),
      fetch('/api/map/hotspots').then((r) => r.json()),
      fetch('/api/map/complaints').then((r) => r.json()),
    ]);
    eventLayer.clearLayers();
    hotspotLayer.clearLayers();
    complaintLayer.clearLayers();

    (ev.events || []).forEach((item) => {
      L.circleMarker([item.latitude, item.longitude], { radius: 8, color: '#22d3ee' })
        .bindPopup(`<strong>${item.title}</strong><br>${item.location}<br>${item.verification_label}`)
        .addTo(eventLayer);
    });
    (hs.hotspots || []).forEach((item) => {
      L.circleMarker([item.latitude, item.longitude], { radius: 9, color: '#f59e0b' })
        .bindPopup(`<strong>${item.title}</strong><br>${item.location}<br>Generalized Allegation Hotspot`)
        .addTo(hotspotLayer);
    });
    (cmp.complaints || []).forEach((item) => {
      L.circleMarker([item.latitude, item.longitude], { radius: 7, color: '#3b82f6' })
        .bindPopup(`<strong>${item.title}</strong><br>${item.location}<br>${item.status}`)
        .addTo(complaintLayer);
    });
  }

  refreshLayers();

  const statusEl = document.getElementById('socket-status');
  const socket = io();
  socket.on('connect', () => {
    if (statusEl) statusEl.textContent = 'Live Socket.IO Connected';
  });
  socket.on('disconnect', () => {
    if (statusEl) statusEl.textContent = 'Reconnecting...';
  });
  socket.on('map:event_published', refreshLayers);
  socket.on('map:report_published', refreshLayers);
  socket.on('map:complaint_published', refreshLayers);

  document.getElementById('reset-pune')?.addEventListener('click', () => map.setView([18.5204, 73.8567], 12));
  document.getElementById('reset-india')?.addEventListener('click', () => map.setView([21.1458, 79.0882], 5));
});
