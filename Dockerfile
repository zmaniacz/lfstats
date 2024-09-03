FROM php:7.4-apache

RUN apt-get update -yqq \
    && apt-get install -yqq --no-install-recommends \
    git \
    zip \
    unzip \
    gnupg \
    && rm -rf /var/lib/apt/lists

#Grap pg repo key
RUN curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/apt.postgresql.org.gpg >/dev/null

#Add the pg repo
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ bullseye-pgdg main" > /etc/apt/sources.list.d/postgresql.list'

RUN apt-get update -yqq \
    && apt-get install -yqq --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists

# Enable PHP extensions
RUN docker-php-ext-install pdo_pgsql opcache

COPY docker/php/conf.d/opcache.ini /usr/local/etc/php/conf.d/opcache.ini

# Install composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/bin/ --filename=composer

# Add cake and composer command to system path
ENV PATH="${PATH}:/var/www/html/lib/Cake/Console"
ENV PATH="${PATH}:/var/www/html/app/Vendor/bin"

# COPY apache site.conf file
COPY ./docker/apache/site.conf /etc/apache2/sites-available/000-default.conf

# Use the default production configuration
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Copy the source code into /var/www/html/ inside the image
#COPY . .

# Set default working directory
#WORKDIR ./app

# Create tmp directory and make it writable by the web server
RUN mkdir -p \
    tmp/cache/models \
    tmp/cache/persistent \
    && chown -R :www-data \
    tmp \
    && chmod -R 770 \
    tmp

# Enable Apache modules and restart
RUN a2enmod rewrite \
    && service apache2 restart

EXPOSE 80
