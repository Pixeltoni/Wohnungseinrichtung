# Wohnungseinrichtung

Perfekte Einrichtungsausrichtung für deine Wohnung finden und ausprobieren.

Ein Planungswerkzeug im Browser: Du gibst die Maße deiner Räume ein und bekommst einen maßstabsgetreuen Grundriss. Dann kannst du Möbel hineinstellen, verschieben und drehen.

## Starten

Keine Installation nötig: Öffne einfach `index.html` im Browser (Doppelklick).

## Funktionen

- **Räume** mit Name, Breite und Länge (Innenmaße in cm) anlegen und jederzeit bearbeiten. Neue Räume werden direkt angrenzend platziert. Beim Verschieben rasten sie an Nachbarräume an und teilen sich dann **eine gemeinsame Wand** (keine doppelten Wände). Die Möbel im Raum wandern mit.
- **Größe ziehen:** Bei einem ausgewählten Raum lassen sich die Wände und Ecken mit der Maus ziehen, wie bei einem Fenster am PC. Eine gemeinsame Wand wird dabei mitgenommen: Der Nachbarraum wird entsprechend kleiner bzw. größer, Türen und Fenster bleiben an ihrem Platz.
- **Wandmaße** stehen an jeder Wand im Raum.
- **Wände** anklicken, um ihre **Dicke** einzustellen, sie ganz zu entfernen (z. B. für offene Küchen) oder **Türen**, **Fenster** und **Durchgänge** (Wandöffnung ohne Tür) einzusetzen. Bei einer gemeinsamen Wand gilt die Dicke für beide Räume; der Nachbarraum rückt entsprechend, die Innenmaße bleiben gleich. Türen haben eine einstellbare Breite, Türangel (links/rechts) und Öffnungsrichtung; der Schwenkbereich wird als Bogen angezeigt. Türen und Fenster lassen sich mit der Maus entlang der Wand verschieben.
- **Möbel können nicht in Wände** oder Fenster geschoben werden. Sie werden automatisch herausgeschoben und rasten bündig an Wänden ein.
- **Möbel-Bibliothek** (Bett, Sofa, Tisch, Schrank, …). Jedes Möbelstück lässt sich umbenennen und in den Maßen anpassen.
- **Verschieben** per Drag & Drop oder mit den Pfeiltasten, **Drehen** um 90° mit der Taste `R`. Die dunkle Linie markiert die Rückseite, z. B. das Kopfende des Betts.
- **Prüfungen:** Möbel, die sich überschneiden oder im Schwenkbereich einer Tür stehen, werden rot umrandet. Möbel außerhalb eines Raums werden orange gestrichelt umrandet.
- **Speichern:** Die Planung wird automatisch im Browser gespeichert und kann als JSON-Datei exportiert und wieder importiert werden.

## Grundriss importieren

Unter **„Grundriss importieren“** ein Bild des Grundrisses hochladen (JPG/PNG; bei PDFs einen Screenshot). Es liegt dann als Hintergrund im Plan.

Zuerst **„Maßstab festlegen“**: zwei Punkte einer Strecke mit bekannter Länge anklicken und die echte Länge eingeben. Dann **„Räume nachzeichnen“**: Rechtecke entlang der Innenkanten der Räume ziehen.

Danach sind alle Räume ganz normal bearbeitbar (Maße, Wände, Türen, Fenster).

## Ansicht

Mit dem **Mausrad** (oder Trackpad bzw. zwei Fingern) wird der Plan gezoomt, durch **Ziehen auf leerer Fläche** (oder mit der mittleren Maustaste) verschoben. Die Seitenleiste bleibt dabei immer sichtbar. Unten rechts gibt es **+**, **−** und **Einpassen**.

## Tastatur

| Taste | Aktion |
| --- | --- |
| Pfeiltasten | 1 cm verschieben (mit Shift: 10 cm) |
| `R` | Möbelstück um 90° drehen |
| `Entf` | Auswahl löschen |
| `Esc` | Auswahl aufheben |
| `+` / `−` | Zoomen |
| `0` | Alles einpassen |

## Ideen für später

- Räume mit beliebigen Grundrissen (L-Form, Schrägen)
- Eigene Möbel in der Bibliothek speichern
- 3D-Ansicht
