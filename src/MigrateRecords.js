// MigrateRecords.js
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";

/**
 * MigrateRecords.js
 * - Legge da collection "competitions"
 * - Recupera dati atleti da "athletes"
 * - Mostra tabella con campi modificabili:
 *    - recordType (dropdown)
 *    - category (dropdown dinamica in base a recordType)
 *    - distance (dropdown fisso)
 *    - style (dropdown fisso)
 *    - time (min / sec / decimi) -> salva in timeFormatted come 00'16"10
 * - Salva in batch SOLO i record modificati
 *
 * NOTE:
 * - Mantiene altri campi in sola lettura (competitionName, date, placement, athleteName, birthYear)
 * - Prima di eseguire il salvataggio, viene chiesta conferma
 */

export default function MigrateRecords() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]); // ogni riga: { id, athleteId, athleteName, birthYear, competitionName, date, placement, recordType, category, distance, style, timeFormatted, original: {...}, changed }
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    toSave: 0,
    saved: 0,
    errors: 0,
  });

  // Costanti UI
  const RECORD_TYPES = ["Propaganda", "Agonista", "Master"];
  const DISTANCES = ["25m", "50m", "100m", "200m", "400m", "800m", "1500m"];
  const STYLES = ["Stile libero", "Dorso", "Rana", "Farfalla", "Misto"];

  // Categorie disponibili in base alla tipologia
  const CATEGORIES = {
    Propaganda: [
      "Esordienti",
      "Giovanissimi",
      "Allievi",
      "Ragazzi",
      "Juniores",
      "Cadetti",
      "Seniores",
      "Amatori 20",
      "Over",
    ],
    Agonista: [
      "Esordienti B",
      "Esordienti A",
      "Ragazzi",
      "Juniores",
      "Cadetti",
      "Seniores",
    ],
    Master: generateMasterCategories(),
  };

  function addLog(message, type = "info") {
    const t = new Date().toLocaleTimeString("it-IT");
    setLog((prev) => [...prev, { message, type, timestamp: t }]);
    console.log(`[${t}] ${message}`);
  }

  function generateMasterCategories() {
    const res = [];
    for (let a = 20; a <= 100; a += 5) {
      res.push(`M${a}`);
    }
    return res;
  }

  // Normalizza anno di nascita
  const getBirthYear = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === "number" && Number.isFinite(val)) {
      if (val > 1900 && val <= 2100) return Math.trunc(val);
      if (val > 100000000000) {
        const d = new Date(val);
        if (!isNaN(d)) return d.getFullYear();
      }
      return Math.trunc(val);
    }
    if (typeof val === "string") {
      const s = val.trim();
      if (/^\d{4}$/.test(s)) return Number(s);
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) return new Date(parsed).getFullYear();
      const maybeYear = s.match(/(19|20)\d{2}/);
      if (maybeYear) return Number(maybeYear[0]);
      return null;
    }
    if (val instanceof Date) {
      if (!isNaN(val)) return val.getFullYear();
      return null;
    }
    if (typeof val === "object") {
      if (typeof val.toDate === "function") {
        try {
          const d = val.toDate();
          if (d instanceof Date && !isNaN(d)) return d.getFullYear();
        } catch (e) {}
      }
      if (
        Object.prototype.hasOwnProperty.call(val, "seconds") &&
        typeof val.seconds === "number"
      ) {
        try {
          const d = new Date(val.seconds * 1000);
          if (!isNaN(d)) return d.getFullYear();
        } catch (e) {}
      }
    }
    return null;
  };

  // Parsing timeFormatted "00'16\"10" -> {min, sec, dec}
  const parseTimeFormatted = (tf) => {
    if (!tf) return { min: "", sec: "", dec: "" };
    // regex: mm'ss"cc   e.g. 00'16"10
    const m = tf.match(/^(\d{1,2})'(\d{1,2})"(\d{1,2})$/);
    if (m) {
      return {
        min: String(Number(m[1])).padStart(2, "0"),
        sec: String(Number(m[2])).padStart(2, "0"),
        dec: String(Number(m[3])).padStart(2, "0"),
      };
    }
    // fallback: try split by non-digits
    const nums = tf.match(/\d+/g) || [];
    return {
      min: nums[0] ? String(Number(nums[0])).padStart(2, "0") : "",
      sec: nums[1] ? String(Number(nums[1])).padStart(2, "0") : "",
      dec: nums[2] ? String(Number(nums[2])).padStart(2, "0") : "",
    };
  };

  // Format time parts to timeFormatted string
  const formatTime = (min, sec, dec) => {
    const m =
      String(min ?? "").trim() === "" ? "00" : String(min).padStart(2, "0");
    const s =
      String(sec ?? "").trim() === "" ? "00" : String(sec).padStart(2, "0");
    const d =
      String(dec ?? "").trim() === "" ? "00" : String(dec).padStart(2, "0");
    return `${m}'${s}"${d}`;
  };

  // Caricamento iniziale
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      addLog("📥 Caricamento competitions e athletes...", "info");
      try {
        const compsSnap = await getDocs(collection(db, "competitions"));
        const comps = compsSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() || {},
        }));
        addLog(
          `📊 Trovati ${comps.length} documenti in 'competitions'`,
          "info"
        );

        // ricava athleteId unici
        const athleteIds = Array.from(
          new Set(comps.map((c) => c.data.athleteId).filter(Boolean))
        );

        // carica athletes (per DB non enorme; se DB molto grande cambiare strategie)
        const athletesMap = new Map();
        if (athleteIds.length > 0) {
          const athletesSnap = await getDocs(collection(db, "athletes"));
          athletesSnap.docs.forEach((a) => {
            athletesMap.set(a.id, a.data() || {});
          });
          addLog(
            `📊 Caricati ${athletesMap.size} atleti dalla collection 'athletes'`,
            "info"
          );
        } else {
          addLog(
            "ℹ️ Nessun athleteId trovato nei documenti competitions.",
            "warning"
          );
        }

        const rows = comps.map((c) => {
          const rec = c.data;
          const athleteRaw = athletesMap.get(rec.athleteId) || null;
          const birthCandidate =
            (athleteRaw &&
              (athleteRaw.birthYear ??
                athleteRaw.birthDate ??
                athleteRaw.dateOfBirth)) ||
            null;
          const birthYear = getBirthYear(birthCandidate);
          const athleteName = athleteRaw
            ? `${athleteRaw.name ?? ""} ${athleteRaw.lastName ?? ""}`.trim()
            : `ID:${rec.athleteId ?? "?"}`;

          // timeFormatted may be present as rec.timeFormatted
          const tf = rec.timeFormatted ?? "";
          const parsedTime = parseTimeFormatted(tf);

          const initialRecordType =
            rec.recordType ?? (athleteRaw && athleteRaw.type) ?? "";
          const initialCategory = rec.category ?? "";
          const initialDistance = rec.distance ?? "";
          const initialStyle = rec.style ?? "";

          return {
            id: c.id,
            athleteId: rec.athleteId ?? null,
            athleteName,
            birthYear,
            competitionName: rec.competitionName ?? "",
            date: rec.date ?? "",
            placement: rec.placement ?? "",
            recordType: initialRecordType,
            category: initialCategory,
            distance: initialDistance,
            style: initialStyle,
            timeParts: {
              min: parsedTime.min,
              sec: parsedTime.sec,
              dec: parsedTime.dec,
            }, // editable parts
            timeFormatted: tf,
            original: {
              recordType: initialRecordType,
              category: initialCategory,
              distance: initialDistance,
              style: initialStyle,
              timeFormatted: tf,
            },
            changed: false,
            rawRecord: rec,
          };
        });

        if (!mounted) return;
        setRecords(rows);
        setStats((s) => ({ ...s, total: rows.length }));
        addLog("✅ Dati pronti per la modifica.", "success");
      } catch (err) {
        addLog(`❌ Errore caricamento: ${err.message}`, "error");
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Helpers per marcatura cambiamenti
  const markChanged = (r) => {
    const o = r.original || {};
    const tfNew = formatTime(r.timeParts.min, r.timeParts.sec, r.timeParts.dec);
    const changed =
      (r.recordType ?? "") !== (o.recordType ?? "") ||
      (r.category ?? "") !== (o.category ?? "") ||
      (r.distance ?? "") !== (o.distance ?? "") ||
      (r.style ?? "") !== (o.style ?? "") ||
      tfNew !== (o.timeFormatted ?? "");
    return changed;
  };

  // Gestione change recordType
  const onChangeRecordType = (idx, newType) => {
    setRecords((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], recordType: newType };
      // se categoria non valida per nuovo tipo -> svuotala
      const validCats = CATEGORIES[newType] ?? [];
      if (!validCats.includes(copy[idx].category)) copy[idx].category = "";
      copy[idx].changed = markChanged(copy[idx]);
      return copy;
    });
  };

  // Gestione change category
  const onChangeCategory = (idx, newCat) => {
    setRecords((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        category: newCat,
        changed: markChanged({ ...copy[idx], category: newCat }),
      };
      return copy;
    });
  };

  // Change distance
  const onChangeDistance = (idx, newDist) => {
    setRecords((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        distance: newDist,
        changed: markChanged({ ...copy[idx], distance: newDist }),
      };
      return copy;
    });
  };

  // Change style
  const onChangeStyle = (idx, newStyle) => {
    setRecords((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        style: newStyle,
        changed: markChanged({ ...copy[idx], style: newStyle }),
      };
      return copy;
    });
  };

  // Change time parts
  const onChangeTimePart = (idx, part, value) => {
    // allow only digits, max lengths (min 2, sec 2, dec 2)
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    setRecords((prev) => {
      const copy = [...prev];
      const tp = { ...copy[idx].timeParts, [part]: cleaned };
      copy[idx] = {
        ...copy[idx],
        timeParts: tp,
        changed: markChanged({ ...copy[idx], timeParts: tp }),
      };
      return copy;
    });
  };

  // fill empty categories utility
  const fillEmptyCategories = (value) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (!r.category || r.category === "") {
          const newR = { ...r, category: value };
          newR.changed = markChanged(newR);
          return newR;
        }
        return r;
      })
    );
  };

  // Conta modifiche
  useEffect(() => {
    const changed = records.filter((r) => r.changed).length;
    setStats((s) => ({ ...s, toSave: changed }));
  }, [records]);

  // Salvataggio batch: aggiorna soltanto i campi modificati (recordType, category, distance, style, timeFormatted)
  const saveAll = async () => {
    const toUpdate = records.filter((r) => r.changed);
    if (toUpdate.length === 0) {
      addLog("ℹ️ Nessuna modifica da salvare.", "info");
      return;
    }
    if (
      !window.confirm(
        `Confermi di salvare ${toUpdate.length} modifiche su 'competitions'?`
      )
    )
      return;

    setSaving(true);
    addLog(`💾 Salvataggio di ${toUpdate.length} record in batch...`, "info");
    const batch = writeBatch(db);
    let errors = 0;

    try {
      toUpdate.forEach((r) => {
        const ref = doc(db, "competitions", r.id);
        const payload = {};
        // recordType
        if (r.recordType !== undefined) payload.recordType = r.recordType ?? "";
        // category
        payload.category = r.category ?? "";
        // distance & style
        payload.distance = r.distance ?? "";
        payload.style = r.style ?? "";
        // timeFormatted from parts
        payload.timeFormatted = formatTime(
          r.timeParts.min,
          r.timeParts.sec,
          r.timeParts.dec
        );

        batch.update(ref, payload);
      });

      await batch.commit();
      addLog(
        `✅ Salvataggio completato: ${toUpdate.length} record aggiornati.`,
        "success"
      );

      // aggiorna lo stato locale: set original = current, changed = false
      setRecords((prev) =>
        prev.map((r) => {
          if (r.changed) {
            const newTf = formatTime(
              r.timeParts.min,
              r.timeParts.sec,
              r.timeParts.dec
            );
            return {
              ...r,
              original: {
                recordType: r.recordType,
                category: r.category,
                distance: r.distance,
                style: r.style,
                timeFormatted: newTf,
              },
              timeFormatted: newTf,
              changed: false,
            };
          }
          return r;
        })
      );

      setStats((s) => ({ ...s, saved: (s.saved || 0) + toUpdate.length }));
    } catch (err) {
      errors++;
      addLog(`❌ Errore durante il salvataggio: ${err.message}`, "error");
      console.error(err);
    } finally {
      setSaving(false);
      if (errors > 0)
        setStats((s) => ({ ...s, errors: (s.errors || 0) + errors }));
    }
  };

  // annulla modifiche locali
  const revertLocalChanges = () => {
    setRecords((prev) =>
      prev.map((r) => {
        const orig = r.original || {};
        const parsed = parseTimeFormatted(orig.timeFormatted ?? "");
        return {
          ...r,
          recordType: orig.recordType ?? "",
          category: orig.category ?? "",
          distance: orig.distance ?? "",
          style: orig.style ?? "",
          timeParts: { min: parsed.min, sec: parsed.sec, dec: parsed.dec },
          timeFormatted: orig.timeFormatted ?? "",
          changed: false,
        };
      })
    );
    addLog("♻️ Modifiche locali annullate.", "info");
  };

  const checkMissingBirthYear = () => {
    const bad = records.filter((r) => r.birthYear === null).length;
    addLog(
      `🔍 Atleti con birthYear non parsabile: ${bad}`,
      bad > 0 ? "warning" : "info"
    );
    alert(`Atleti con birthYear non parsabile: ${bad}`);
  };

  // RENDER
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <h1 className="text-2xl font-bold mb-4">
        ✏️ Correzione Manuale Record - competitions
      </h1>

      <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
        <p className="font-semibold">Istruzioni:</p>
        <ul className="list-disc ml-6 mt-2 text-sm">
          <li>
            Modifica <strong>RecordType</strong>, <strong>Categoria</strong>,{" "}
            <strong>Distanza</strong>, <strong>Specialità</strong> e/o{" "}
            <strong>Tempo</strong> per ogni record.
          </li>
          <li>
            La tendina <strong>Categoria</strong> è dinamica in base al{" "}
            <strong>RecordType</strong>.
          </li>
          <li>
            Il tempo viene salvato in formato <code>MM'SS"CC</code> (es.{" "}
            <code>00'16"10</code>).
          </li>
          <li>
            Premi <strong>SALVA TUTTE LE MODIFICHE</strong> per applicare le
            modifiche su Firestore (batch).
          </li>
        </ul>
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => window.location.reload()}
        >
          🔁 Ricarica Dati
        </button>

        <div className="flex items-center gap-2">
          <label className="text-sm">Imposta categorie vuote a:</label>
          <select
            className="border rounded px-2 py-1"
            onChange={(e) => {
              if (e.target.value) fillEmptyCategories(e.target.value);
            }}
            defaultValue=""
          >
            <option value="">-- seleziona --</option>
            {CATEGORIES.Propaganda.map((c) => (
              <option key={`fill-${c}`} value={c}>
                {c}
              </option>
            ))}
            {CATEGORIES.Agonista.map((c) => (
              <option key={`fill2-${c}`} value={c}>
                {c}
              </option>
            ))}
            {CATEGORIES.Master.map((c) => (
              <option key={`fill3-${c}`} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto text-sm">
          <strong>Totale:</strong> {stats.total} &nbsp;|&nbsp;{" "}
          <strong>Da salvare:</strong> {stats.toSave}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div>Caricamento dati...</div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Atleta</th>
                  <th className="p-2 text-left">birthYear</th>
                  <th className="p-2 text-left">Competition</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Placement</th>
                  <th className="p-2 text-left">Distance</th>
                  <th className="p-2 text-left">Style</th>
                  <th className="p-2 text-left">Time (MM / SS / CC)</th>
                  <th className="p-2 text-left">RecordType</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">Stato</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={r.id} className={r.changed ? "bg-yellow-50" : ""}>
                    <td className="p-2 align-top">{idx + 1}</td>
                    <td className="p-2 align-top">{r.athleteName}</td>
                    <td className="p-2 align-top">{r.birthYear ?? "—"}</td>
                    <td className="p-2 align-top">{r.competitionName}</td>
                    <td className="p-2 align-top">{r.date}</td>
                    <td className="p-2 align-top">{r.placement}</td>

                    <td className="p-2 align-top">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.distance ?? ""}
                        onChange={(e) => onChangeDistance(idx, e.target.value)}
                      >
                        <option value="">-- seleziona --</option>
                        {DISTANCES.map((d) => (
                          <option key={`${r.id}-dist-${d}`} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2 align-top">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.style ?? ""}
                        onChange={(e) => onChangeStyle(idx, e.target.value)}
                      >
                        <option value="">-- seleziona --</option>
                        {STYLES.map((s) => (
                          <option key={`${r.id}-style-${s}`} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2 align-top">
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          className="w-12 border rounded px-2 py-1"
                          value={r.timeParts.min ?? ""}
                          onChange={(e) =>
                            onChangeTimePart(idx, "min", e.target.value)
                          }
                          placeholder="MM"
                        />
                        <span>:</span>
                        <input
                          type="text"
                          className="w-12 border rounded px-2 py-1"
                          value={r.timeParts.sec ?? ""}
                          onChange={(e) =>
                            onChangeTimePart(idx, "sec", e.target.value)
                          }
                          placeholder="SS"
                        />
                        <span>:</span>
                        <input
                          type="text"
                          className="w-12 border rounded px-2 py-1"
                          value={r.timeParts.dec ?? ""}
                          onChange={(e) =>
                            onChangeTimePart(idx, "dec", e.target.value)
                          }
                          placeholder="CC"
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Formattazione salvata:{" "}
                        {formatTime(
                          r.timeParts.min,
                          r.timeParts.sec,
                          r.timeParts.dec
                        )}
                      </div>
                    </td>

                    <td className="p-2 align-top">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.recordType ?? ""}
                        onChange={(e) =>
                          onChangeRecordType(idx, e.target.value)
                        }
                      >
                        <option value="">-- seleziona --</option>
                        {RECORD_TYPES.map((t) => (
                          <option key={`${r.id}-rt-${t}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2 align-top">
                      <select
                        className="border rounded px-2 py-1 w-44"
                        value={r.category ?? ""}
                        onChange={(e) => onChangeCategory(idx, e.target.value)}
                        disabled={!r.recordType}
                      >
                        <option value="">-- seleziona categoria --</option>
                        {(CATEGORIES[r.recordType] ?? []).map((c) => (
                          <option key={`${r.id}-cat-${c}`} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2 align-top">
                      {r.changed ? (
                        <span className="text-yellow-700 font-medium">
                          Modificata
                        </span>
                      ) : (
                        <span className="text-gray-500">Ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={saveAll}
              disabled={saving || stats.toSave === 0}
              className={`font-bold py-2 px-4 rounded ${
                saving || stats.toSave === 0
                  ? "bg-gray-400 text-gray-800"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              💾 SALVA TUTTE LE MODIFICHE
            </button>

            <button
              onClick={revertLocalChanges}
              className="py-2 px-4 rounded bg-gray-200 hover:bg-gray-300"
            >
              ↩️ Annulla modifiche locali
            </button>

            <button
              onClick={checkMissingBirthYear}
              className="py-2 px-4 rounded bg-indigo-100 hover:bg-indigo-200"
            >
              🔎 Controlla birthYear mancanti
            </button>
          </div>
        </>
      )}

      {/* Log Console */}
      {log.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">📋 Log</h3>
          <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-xs max-h-64 overflow-y-auto">
            {log.map((entry, i) => (
              <div
                key={i}
                className={`mb-1 ${
                  entry.type === "error"
                    ? "text-red-400"
                    : entry.type === "warning"
                    ? "text-yellow-300"
                    : "text-gray-300"
                }`}
              >
                <span className="text-gray-500">[{entry.timestamp}]</span>{" "}
                {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
