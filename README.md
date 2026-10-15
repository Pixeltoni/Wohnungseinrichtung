# Wohnungseinrichtung

Perfekte Einrichtungsausrichtung für deine Wohnung finden und ausprobieren.

Ein Planungswerkzeug im Browser: Du gibst die Maße deiner Räume ein und bekommst einen maßstabsgetreuen Grundriss. Dann kannst du Möbel hineinstellen, verschieben und drehen.

## Starten

Keine Installation nötig: Öffne einfach `index.html` im Browser (Doppelklick).

## Funktionen

- **Räume** mit Name, Breite und Länge (Innenmaße in cm) anlegen und jederzeit bearbeiten. Neue Räume werden direkt angrenzend platziert. Beim Verschieben rasten sie an Nachbarräume an, sodass genau eine Wand dazwischen liegt. Die Möbel im Raum wandern mit.
- **Wandmaße** stehen an jeder Wand im Raum.
- **Wände** anklicken, um ihre **Dicke** einzustellen, sie ganz zu entfernen (z. B. für offene Küchen) oder **Türen**, **Fenster** und **Durchgänge** (Wandöffnung ohne Tür) einzusetzen. Bei einer gemeinsamen Wand gilt die Dicke für beide Räume; der Nachbarraum rückt entsprechend, die Innenmaße bleiben gleich. Türen haben eine einstellbare Breite, Türangel (links/rechts) und Öffnungsrichtung; der Schwenkbereich wird als Bogen angezeigt. Türen und Fenster lassen sich mit der Maus entlang der Wand verschieben.
- **Möbel können nicht in Wände** oder Fenster geschoben werden. Sie werden automatisch herausgeschoben und rasten bündig an Wänden ein.
- **Möbel-Bibliothek** (Bett, Sofa, Tisch, Schrank, …). Jedes Möbelstück lässt sich umbenennen und in den Maßen anpassen.
- **Verschieben** per Drag & Drop oder mit den Pfeiltasten, **Drehen** um 90° mit der Taste `R`. Die dunkle Linie markiert die Rückseite, z. B. das Kopfende des Betts.
- **Prüfungen:** Möbel, die sich überschneiden oder im Schwenkbereich einer Tür stehen, werden rot umrandet. Möbel außerhalb eines Raums werden orange gestrichelt umrandet.
- **Speichern:** Die Planung wird automatisch im Browser gespeichert und kann als JSON-Datei exportiert und wieder importiert werden.

## Grundriss importieren

Unter **„Grundriss importieren“** ein Bild des Grundrisses hochladen (JPG/PNG; bei PDFs einen Screenshot). Es liegt dann als Hintergrund im Plan.

- **Räume automatisch finden (kostenlos, ohne KI):** Die App wertet das Bild selbst aus. Dunkle Flächen gelten als Wände, und jeder von Wänden umschlossene Bereich wird ein Raum, inklusive gemessener Wanddicken. Türöffnungen halten die Erkennung nicht auf. Ist noch kein Maßstab festgelegt, fragt die App nach der echten Breite des größten Raums. Klappt am besten mit dunklen Wänden auf hellem Grund; Raumnamen, Türen und Fenster werden dabei nicht erkannt.
- **Zauberstab:** In einen Raum auf dem Bild klicken, er wird einzeln erkannt und angelegt. Gut zum Ergänzen, wenn die automatische Suche einen Raum übersehen hat.
- **Mit KI erkennen:** Claude liest Räume, Maße, Türen und Fenster aus dem Bild und legt daraus Räume an. Dafür ist ein eigener API-Schlüssel von [console.anthropic.com](https://console.anthropic.com/) nötig. Der Schlüssel wird nur im eigenen Browser gespeichert, und das Bild geht direkt vom Browser an die Anthropic-API. Funktioniert nur über die veröffentlichte Webseite, nicht beim direkten Öffnen der Datei.
- **Von Hand:** Zuerst **„Maßstab festlegen“**: zwei Punkte einer Strecke mit bekannter Länge anklicken und die echte Länge eingeben. Dann **„Räume nachzeichnen“**: Rechtecke entlang der Innenkanten der Räume ziehen.

Danach sind alle Räume ganz normal bearbeitbar (Maße, Wände, Türen, Fenster).

Das Anthropic-SDK liegt gebündelt unter `vendor/anthropic-sdk.mjs` (Version 0.129.0, MIT-Lizenz).

## Tastatur

| Taste | Aktion |
| --- | --- |
| Pfeiltasten | 1 cm verschieben (mit Shift: 10 cm) |
| `R` | Möbelstück um 90° drehen |
| `Entf` | Auswahl löschen |
| `Esc` | Auswahl aufheben |

## Ideen für später

- Räume mit beliebigen Grundrissen (L-Form, Schrägen)
- Zoomen und Verschieben der Ansicht
- Eigene Möbel in der Bibliothek speichern
- 3D-Ansicht
