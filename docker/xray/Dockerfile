FROM alpine:3.20

ARG XRAY_VERSION=26.2.6

RUN apk add --no-cache ca-certificates curl unzip bash coreutils \
  && curl -fL -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-64.zip" \
  && unzip -j /tmp/xray.zip xray geoip.dat geosite.dat -d /usr/local/bin \
  && chmod +x /usr/local/bin/xray \
  && mkdir -p /usr/local/share/xray /etc/xray /var/log/xray \
  && mv /usr/local/bin/geoip.dat /usr/local/share/xray/geoip.dat \
  && mv /usr/local/bin/geosite.dat /usr/local/share/xray/geosite.dat \
  && rm -f /tmp/xray.zip

COPY docker/xray/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
