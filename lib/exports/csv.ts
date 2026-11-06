export function csv(rows: readonly (readonly unknown[])[]): string {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = value == null ? '' : String(value);
            // Leading whitespace/control characters must not hide a spreadsheet formula.
            if (/^[\s\u0000-\u001f]*[=+@-]/u.test(cell) || /^[\t\r\n]/u.test(cell))
              cell = "'" + cell;
            return '"' + cell.replaceAll('"', '""') + '"';
          })
          .join(';'),
      )
      .join('\r\n') +
    '\r\n'
  );
}
