import SpecialistMonkeyScene from "./SpecialistMonkeyScene";
import "./specialist-monkey-styles.css";

export default function SpecialistMonkeyPage() {
  return (
    <div className="specialist-monkey-page">
      <header className="specialist-monkey-header">
        <h1 className="specialist-monkey-title">Specialist Monkeys</h1>
        <p className="specialist-monkey-subtitle">Explore the temple</p>
      </header>
      <SpecialistMonkeyScene />
    </div>
  );
}
