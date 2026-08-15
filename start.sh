#!/bin/bash
cd /home/grishberg/projects/web/pc_viewer_3d
exec npx http-server dist -p 5173 -a 0.0.0.0 -s
