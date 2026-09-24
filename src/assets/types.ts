export interface SchemaAssetFile {
  /** Path relative to the package `schemas/` directory, e.g. `schema/observation.schema.json`. */
  readonly path: string;
  readonly sha256: string;
}

export interface SchemaAssetProvenance {
  /** GitHub repository that owns the canonical GBOS contract. */
  readonly repository: string;
  /** Release tag the assets were taken from. */
  readonly tag: string;
  /** Commit the release tag points to. */
  readonly commit: string;
  /** Released artifact the schema and registry files were extracted from, byte-for-byte. */
  readonly artifact: {
    readonly name: string;
    readonly url: string;
    readonly sha256: string;
  };
  /** Upstream license, redistributed alongside the assets. */
  readonly license: SchemaAssetFile & { readonly url: string };
  readonly files: readonly SchemaAssetFile[];
}
