ARG ALPINE_VERSION=3.17
FROM alpine:${ALPINE_VERSION}

# Setup document root
WORKDIR /var/www/html

# Install packages and remove default server definition
RUN apk add --no-cache \
  curl \
  nginx \
  php81 \
  php81-ctype \
  php81-curl \
  php81-dom \
  php81-fpm \
  php81-gd \
  php81-intl \
  php81-mbstring \
  php81-mysqli \
  php81-opcache \
  php81-openssl \
  php81-pdo \
  php81-pdo_pgsql \
  php81-pgsql \
  php81-phar \
  php81-session \
  php81-xml \
  php81-xmlreader \
  supervisor

# Configure nginx - http
COPY docker/config/nginx.conf /etc/nginx/nginx.conf
# Configure nginx - default server
COPY docker/config/conf.d /etc/nginx/conf.d/

# Configure PHP-FPM
COPY docker/config/fpm-pool.conf /etc/php81/php-fpm.d/www.conf
COPY docker/config/php.ini /etc/php81/conf.d/custom.ini

# Configure supervisord
COPY docker/config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Make sure files/folders needed by the processes are accessable when they run under the nobody user
RUN chown -R nobody.nobody /var/www/html /run /var/lib/nginx /var/log/nginx

# Switch to use a non-root user from here on
USER nobody

# Add application
COPY --chown=nobody . /var/www/html/

# Expose the port nginx is reachable on
EXPOSE 80

# Let supervisord start nginx & php-fpm
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# Configure a healthcheck to validate that everything is up&running
HEALTHCHECK --timeout=10s CMD curl --silent --fail http://127.0.0.1:8080/fpm-ping