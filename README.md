# agg23's MiSTer Cores

This is a repository of my MiSTer cores for the [MiSTer Downloader](https://github.com/MiSTer-devel/Downloader_MiSTer).

To use the downloader, place the following snippet at the bottom of your `downloader.ini` file, located at the root of the SD card. You can now launch the downloader the normal way in `Scripts` and you will download my cores.

```
; This allows you to continue to receive main MiSTer downloads
[distribution_mister]

[agg23_db]
db_url = 'https://github.com/agg23/mister-repository/raw/db/manifest.json'
```