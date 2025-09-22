---
title: Immunopeptidomics Tools
toc: true
theme: [air]
---

<div class="hero">
  <h1>Immunopeptidomics Tools</h1>
  <h2>Explore and compare peptide presentation: upload sequences, visualise binding, and inspect diversity & conservation.</h2>
</div>

<style>
/* Minimal, accessible styling; keep it simple */
body { font-family: "Roboto", "Helvetica Neue", Arial, sans-serif; line-height: 1.65; color: var(--theme-foreground, #222); }
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 3rem 0 4rem;
  text-align: center;
  gap: 1rem;
  text-wrap: balance;
}
.hero h1 {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: clamp(2.75rem, 6vw, 3.6rem);
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: -0.01em;
  background: linear-gradient(32deg, var(--theme-foreground-focus), currentColor);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero h2 {
  margin: 0;
  max-width: 42rem;
  font-size: clamp(1.125rem, 2.4vw, 1.5rem);
  font-weight: 400;
  color: var(--theme-foreground-muted, #555);
}
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 1rem;
  background: var(--theme-foreground, #111);
  color: var(--theme-background, #fff);
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}


.card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-top: 0.75rem; }
.card { padding: 1.1rem; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.04); }
.card h3 { margin-top: 0; }
kbd { background: #f2f2f2; border: 1px solid #e5e5e5; border-radius: 4px; padding: 0 0.25rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
figure { margin: 1.25rem 0; }
figcaption { font-size: 0.9rem; color: #666; }
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { padding: 0.5rem; border-bottom: 1px solid #eee; text-align: left; }

@media (min-width: 768px) {
  .hero { margin: 3.5rem 0 5rem; }
  .card { padding: 1.25rem; }
}
</style>

## Overview

This site provides two tools:

<div class="card-grid">
  <div class="card">
    <h3>Peptide Viewer</h3>
    <p>Upload a reference .fasta and a peptide .csv to visualize peptides along proteins and compute diversity & conservation.</p>
    <p><a href="#peptide-viewer">Jump to guide &rarr;</a></p>
  </div>
  <div class="card">
    <h3>MHCOMP</h3>
    <p>Compare allele binding predictions across proteins and positions. Choose alleles, peptide lengths, run predictions, and inspect heatmaps and tables.</p>
    <p><a href="#mhcomp">Jump to guide &rarr;</a></p>
  </div>
</div>

<h2 id="get-started">Get started</h2>

1. Prepare a reference sequence (.fasta) with short protein names (e.g., M1, not "Matrix Protein 1").  
2. Prepare a peptide list (.csv) with at least <code>peptide</code> and <code>protein</code> columns. Additional "attribute" columns are optional, and can be used to label your peptides.  
3. Open **Peptide Viewer** or **MHCOMP**, upload files, and explore.

### Example: reference .fasta (X31)

```.fasta
>M1
MSLLTEVETYVLSIIPSGPLKAEIAQRLEDVFAGKNTDLEVLMEWLKTRPILSPLTKGIL
GFVFTLTVPSERGLQRRRFVQNALNGNGDPNNMDKAVKLYRKLKREITFHGAKEISLSYS
AGALASCMGLIYNRMGAVTTEVAFGLVCATCEQIADSQHRSHRQMVTTTNPLIRHENRMV
LASTTAKAMEQMAGSSEQAAEAMEVASQARQMVQAMRTIGTHPSSSAGLKNDLLENLQAY
QKRMGVQMQRFK
>NS1
MDPNTVSSFQVDCFLWHVRKRVADQELGDAPFLDRLRRDQKSLRGRGSTLGLDIKTATRA
GKQIVERILKEESDEALKMTMASVPASRYLTDMTLEEMSRDWSMLIPKQKVAGPLCIRMD
QAIMDKNIILKANFSVIFDRLETLILLRAFTEEGAIVGEISPLPSLPGHTAEDVKNAVGV
LIGGLEWNDNTVRVSETLQRFAWRSSNENGRPPLTPKQKREMAGTIRSEV
>NS2
MDPNTVSSFQDILLRMSKMQLESSSEDLNGMITQFESLKLYRDSLGEAVMRMGDLHSLQN
RNEKWREQLGQKFEEIRWLIEEVRHKLKITENSFEQITFMQALHLLLEVEQEIRTFSFQL
I
```

### Example: peptide .csv

| peptide | protein | attribute 1 | attribute 2 | attribute 3 |
| --- | --- | --- | --- | --- |
| MSLLTEVET | M1 | A*11:01 | Human | A11 |
| QKREMAGTIRSEV | NS1 | A*11:01 | Mouse | A11 |
| IPSGPLKAE | M1 | B*35:03 | Human | B13 |

Note: Diversity and conservation metrics can be used without a peptide set.

<h2 id="peptide-viewer">Peptide Viewer guide</h2>

### What it does

Visualise peptides aligned to an aligned viral isolate set and inspect diversity/conservation along the sequence. The UI has three sections:

- Select Files &ndash; Upload reference and peptides.
- Filter &ndash; Subset by protein, peptide length, attributes, etc.
- Control Panel &ndash; Choose what to display (tracks, metrics, legends) and export views.

### Inputs

- Reference .fasta: Must use short names like <code>M1</code>, <code>NS1</code>, <code>NS2</code>.
- Peptide .csv: Requires the columns <code>peptide</code> and <code>protein</code>. Any extra columns are free-form attributes to label conditions (e.g., allele, cohort, treatment).

### Typical workflow

1. Upload the FASTA (short names required).
2. Upload the peptide CSV.
3. Use Filter to focus on proteins, lengths, or attributes.
4. In Control Panel, toggle diversity/conservation and relevant tracks.
5. Hover to see positions, click to pin selections, and export figures/tables when needed.

Tip: If peptides do not appear, confirm the <code>protein</code> names in your CSV exactly match the short names in the FASTA.

<h2 id="mhcomp">MHCOMP guide</h2>

Compare predicted binding across alleles along a protein sequence.

### Inputs & parameters

- Upload Sequence (.fasta) or paste sequences.
- Upload Peptides (.txt/.csv) (optional).
- Predictor: Choose (e.g.) "Class I &mdash; netMHCpan 4.1 EL".
- Alleles: Type to add multiple alleles.
- Peptide length: Choose a fixed length (e.g., 9&ndash;14).
- Click Run prediction.

### Display & interpretation

- Sequence: Select the protein to visualize.
- Heatmap length: Choose the peptide window (e.g., 9).
- Key (binding percentile): Lower percentiles indicate stronger predicted binding.
- Views:
  - Peptides: Table of predicted binders and positions.
  - Heatmap: Binding percentile across the sequence for each allele.
  - Allele: Per-allele stacked tiles across positions (helps compare patterns).

### Suggested workflow

1. Upload FASTA containing your target proteins.
2. Upload peptide list if you want to cross-reference predicted binders with observed peptides.
3. Choose a predictor, set peptide length, add alleles, and click Run prediction.
4. Use Sequence and Heatmap length to adjust the view.
5. Switch between Peptides / Heatmap / Allele to analyze different summaries.
6. Export figures/tables as needed.

## File format checklist

| Format | Required columns / headers | Notes |
| --- | --- | --- |
| FASTA | Short protein names (e.g., > M1) | Names must match your peptide CSV protein values. |
| CSV (peptides) | peptide, protein | Extra columns are optional attributes and will be shown as labels/filters. |

## Troubleshooting

- No peptides visible: CSV headers must be exactly <code>peptide</code> and <code>protein</code>; protein names must match FASTA short names.
- Weird positions: Confirm 1-based indexing assumed by your data vs the tool's display.
- Slow predictions: Reduce allele count or test a single protein first.