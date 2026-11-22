// Camera tour stops. target y is resolved from the terrain at runtime (+ lift).
// theta: angle of the camera around the target in the x/z plane (x = cos, z = sin). phi: from straight up.
export const VIEWS = {
  overview: { label: 'Island', target: [0, 0, 10], lift: 6, radius: 270, theta: 0.9, phi: 1.0 },
  forest: { label: 'Forest', target: [-10, 0, -55], lift: 8, radius: 80, theta: 0.6, phi: 1.22 },
  meadow: { label: 'Meadow', target: [52, 0, 0], lift: 3, radius: 55, theta: 0.3, phi: 1.28 },
  tropics: { label: 'Tropics', target: [20, 0, 76], lift: 3, radius: 55, theta: 1.2, phi: 1.3 },
  desert: { label: 'Desert', target: [-62, 0, 4], lift: 4, radius: 65, theta: 2.6, phi: 1.22 },
  reef: { label: 'Reef', target: [30, 0, 122], lift: 0, radius: 20, theta: 1.0, phi: 1.62, underwater: true },
};
export const VIEW_LIST = Object.keys(VIEWS).map((id) => ({ id, label: VIEWS[id].label }));
