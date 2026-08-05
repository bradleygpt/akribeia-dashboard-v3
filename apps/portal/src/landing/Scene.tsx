import { Planets } from "./Planets";
import { Suns } from "./Suns";

export function Scene() {
  return (
    <section className="portal-scene" aria-labelledby="portal-scene-title">
      <h2 className="portal-visually-hidden" id="portal-scene-title">
        Akribeia product destinations
      </h2>
      <div className="portal-orbit portal-orbit-outer" aria-hidden="true" />
      <div className="portal-orbit portal-orbit-inner" aria-hidden="true" />
      <Suns />
      <Planets />
      <p className="portal-scene-note" aria-hidden="true">
        SELECT A BODY TO ENTER
      </p>
    </section>
  );
}
