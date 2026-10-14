import numpy as np
import json

class HockeyShotSimulationEngine:
    """
    Volledige Natuurkundige Simulatie Engine voor IJshockeyschoten & 3D GLB Animatie.
    
    Auteurs: Blackout Hockey Physics Lab
    Functionaliteit:
      1. Shaft Stijfheidsprofiel EI(x) voor Low, Mid & Hybrid kickpoints
      2. Euler-Bernoulli 3-Punts Buigingsmechanica & Potentiële Energie-opslag E_pot
      3. Elastic Recoil, Impact Restitutie & Puck Uittreedsnelheid (V_launch)
      4. Runge-Kutta 4e Orde (RK4) 3D Ballistische Trajectorie Solver (Luchtweerstand, Zwaartekracht, Spin & Ijs-wrijving)
      5. GLB/Three.js Bone & Spline Transformation Data Exporter
    """

    def __init__(self):
        # Fysische constanten
        self.g = 9.81                   # m/s^2 (zwaartekracht)
        self.rho_air = 1.225            # kg/m^3 (luchtdichtheid bij 15°C)
        self.m_puck = 0.160             # kg (standaard IIHF puck = 160 gram)
        self.r_puck = 0.038             # m (straal = 38 mm)
        self.h_puck = 0.0254            # m (hoogte = 1 inch = 25.4 mm)
        self.A_puck_flat = np.pi * (self.r_puck ** 2) # m^2 (~0.004536 m^2)
        self.A_puck_side = 2 * self.r_puck * self.h_puck # m^2 (~0.00193 m^2)
        self.e_cor = 0.32               # Restitutiecoëfficiënt (bevroren rubber vs carbon)
        self.mu_ice = 0.04              # Dynamische wrijvingscoëfficiënt ijs

    def flex_to_stiffness(self, flex_rating):
        """Converteert Flex-rating naar globale veerconstante (N/m)."""
        return flex_rating * 175.126

    def generate_stiffness_profile(self, L, flex_rating, kickpoint="low", x_hand_ratio=0.60):
        """
        Genereert het buigstijfheidsprofiel EI(x) over de lengte x van de schacht.
        """
        num_points = 50
        x = np.linspace(0, L, num_points)
        K_base = self.flex_to_stiffness(flex_rating)
        EI_mean = (K_base * (L ** 3)) / 48.0

        if kickpoint == "low":
            profile_factor = 1.0 - 0.45 * np.exp(-((x - 0.25 * L) / (0.12 * L)) ** 2)
        elif kickpoint == "mid":
            profile_factor = 1.0 - 0.40 * np.exp(-((x - 0.50 * L) / (0.20 * L)) ** 2)
        elif kickpoint == "hybrid":
            x_min = x_hand_ratio * L * 0.5
            profile_factor = 1.0 - 0.42 * np.exp(-((x - x_min) / (0.15 * L)) ** 2)
        else:
            profile_factor = np.ones_like(x)

        EI = EI_mean * profile_factor
        return x, EI

    def calculate_shaft_deflection(self, L, flex_rating, F_bottom, kickpoint="low", x_hand_ratio=0.60):
        """
        Berekent de 2D/3D elastische buigcurve y(x) en opgeslagen potentiële energie E_pot.
        """
        x, EI = self.generate_stiffness_profile(L, flex_rating, kickpoint, x_hand_ratio)
        dx = x[1] - x[0]
        x_hand = x_hand_ratio * L

        F_ice = F_bottom * ((L - x_hand) / L)
        F_top = F_bottom * (x_hand / L)

        M = np.where(x <= x_hand, F_ice * x, F_top * (L - x))
        d2y_dx2 = M / EI

        dy_dx = np.cumsum(d2y_dx2) * dx
        y_temp = np.cumsum(dy_dx) * dx
        C1 = -y_temp[-1] / L
        dy_dx += C1
        y = np.cumsum(dy_dx) * dx

        D_max = np.max(np.abs(y))
        E_pot = 0.5 * np.sum(EI * (d2y_dx2 ** 2)) * dx

        return {
            "x_nodes": x,
            "y_deflection": y,
            "D_max_meters": D_max,
            "D_max_inches": D_max / 0.0254,
            "E_pot_joules": E_pot,
            "F_ice_N": F_ice,
            "F_top_N": F_top
        }

    def simulate_shot(self, 
                      shot_type="wrist_shot",
                      flex_rating=85,
                      kickpoint="low",
                      shooter_force_N=320,
                      swing_speed_kmh=85,
                      pre_load_distance_m=0.03,
                      target_distance_m=10.0,
                      target_height_m=0.9,
                      target_side_offset_m=0.0,
                      wobble_factor=0.05):
        """
        Voert de volledige 3D-simulatie uit van laadfase tot impact op het doel net.
        """
        L_shaft = 1.50
        x_hand_ratio = 0.60 if shot_type in ["wrist_shot", "snap_shot"] else 0.50

        # 1. Schachtdeformatie
        deflection = self.calculate_shaft_deflection(
            L=L_shaft,
            flex_rating=flex_rating,
            F_bottom=shooter_force_N,
            kickpoint=kickpoint,
            x_hand_ratio=x_hand_ratio
        )

        E_pot = deflection["E_pot_joules"]
        E_preload = deflection["F_ice_N"] * pre_load_distance_m * 0.5
        E_total_stored = E_pot + E_preload

        # 2. Uittreedsnelheid
        v_swing_ms = swing_speed_kmh / 3.6
        m_eff_stick = 0.280
        eta_recoil = 0.85

        v_recoil_term = np.sqrt((2.0 * eta_recoil * E_total_stored) / self.m_puck)
        v_impact_term = v_swing_ms * ((1.0 + self.e_cor) / (1.0 + (self.m_puck / m_eff_stick)))
        v_launch_total_ms = v_impact_term + v_recoil_term

        # 3. Vertrekvectoren
        horiz_angle = np.arctan2(target_side_offset_m, target_distance_m)
        vert_angle = np.arctan2(target_height_m, target_distance_m) + 0.015

        vx0 = v_launch_total_ms * np.cos(vert_angle) * np.cos(horiz_angle)
        vy0 = v_launch_total_ms * np.cos(vert_angle) * np.sin(horiz_angle)
        vz0 = v_launch_total_ms * np.sin(vert_angle)

        spin_rpm = 2400 if shot_type == "wrist_shot" else (1800 if shot_type == "snap_shot" else 900)

        # 4. RK4 Integrator
        dt = 0.001
        max_time = 2.5
        state = np.array([0.0, 0.0, 0.08, vx0, vy0, vz0], dtype=np.float64)
        
        trajectory = []
        t = 0.0

        def derivatives(st):
            x_p, y_p, z_p, vx, vy, vz = st
            v_mag = np.sqrt(vx**2 + vy**2 + vz**2)
            if v_mag < 0.1:
                return np.zeros(6)

            Cd = 0.31 + wobble_factor * 0.35
            A_eff = self.A_puck_flat * (1.0 - wobble_factor) + self.A_puck_side * wobble_factor
            F_drag_mag = 0.5 * self.rho_air * A_eff * Cd * (v_mag ** 2)

            ax = - (F_drag_mag / self.m_puck) * (vx / v_mag)
            ay = - (F_drag_mag / self.m_puck) * (vy / v_mag)
            
            Cl = 0.04
            F_lift = 0.5 * self.rho_air * A_eff * Cl * (v_mag ** 2)
            az = -self.g - (F_drag_mag / self.m_puck) * (vz / v_mag) + (F_lift / self.m_puck)

            return np.array([vx, vy, vz, ax, ay, az])

        while t < max_time and state[0] < target_distance_m and state[2] >= 0.0:
            trajectory.append([round(t, 4), round(state[0], 4), round(state[1], 4), round(state[2], 4),
                               round(state[3], 2), round(state[4], 2), round(state[5], 2)])

            k1 = derivatives(state)
            k2 = derivatives(state + 0.5 * dt * k1)
            k3 = derivatives(state + 0.5 * dt * k2)
            k4 = derivatives(state + dt * k3)

            state += (dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
            t += dt

            if state[2] < 0.01 and state[0] < target_distance_m:
                state[2] = 0.005
                v_horiz = np.sqrt(state[3]**2 + state[4]**2)
                if v_horiz > 0.1:
                    a_fric = self.mu_ice * self.g
                    state[3] -= (a_fric * (state[3] / v_horiz)) * dt
                    state[4] -= (a_fric * (state[4] / v_horiz)) * dt
                state[5] = 0.0

        trajectory = np.array(trajectory)

        return {
            "shot_type": shot_type,
            "flex_rating": flex_rating,
            "kickpoint": kickpoint,
            "v_launch_kmh": round(v_launch_total_ms * 3.6, 2),
            "E_stored_joules": round(E_total_stored, 2),
            "D_max_inches": round(deflection["D_max_inches"], 2),
            "flight_time_ms": round(trajectory[-1, 0] * 1000.0, 1),
            "impact_location": {
                "x_m": round(trajectory[-1, 1], 3),
                "y_m": round(trajectory[-1, 2], 3),
                "z_m": round(trajectory[-1, 3], 3)
            },
            "glb_stick_bones": {
                "x_positions": [round(val, 4) for val in deflection["x_nodes"].tolist()],
                "y_deflections": [round(val, 4) for val in deflection["y_deflection"].tolist()]
            },
            "puck_trajectory_frames": trajectory.tolist()
        }

    def export_threejs_json(self, simulation_result, output_filename="/workspace/scratch/shot_simulation_3d.json"):
        """Exporteert de simulatieresultaten naar een direct Three.js / WebGL JSON formaat."""
        with open(output_filename, 'w') as f:
            json.dump(simulation_result, f, indent=2)
        return output_filename

if __name__ == "__main__":
    engine = HockeyShotSimulationEngine()
    sim_data = engine.simulate_shot()
    json_path = engine.export_threejs_json(sim_data)
    print(f"Simulatie voltooid en geëxporteerd naar: {json_path}")
