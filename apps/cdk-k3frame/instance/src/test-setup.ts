if (!process.env['AWS_PROFILE']) {
  process.env['AWS_PROFILE'] = 'k3frame';
}

if (!process.env['AWS_DEFAULT_PROFILE']) {
  process.env['AWS_DEFAULT_PROFILE'] = process.env['AWS_PROFILE'];
}
